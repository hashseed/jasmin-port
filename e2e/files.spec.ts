import { readFile } from 'node:fs/promises';
import { Download, Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

const NOT_A_MEMORY_FILE = 'Not a Jasmin memory file.';

const tab = (page: Page, name: string) => page.getByRole('tab', { name });

const eax = (page: Page) =>
  page
    .getByRole('region', { name: 'Registers', exact: true })
    .getByRole('textbox', { name: 'EAX', exact: true });

const step = (page: Page) =>
  page.getByRole('button', { name: 'Execute the next command', exact: true }).click();

async function fileMenu(page: Page, item: string): Promise<void> {
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menu', { name: 'File' }).getByRole('menuitem', { name: item }).click();
}

async function downloaded(download: Download): Promise<string> {
  return readFile((await download.path())!, 'utf8');
}

/** Removes the File System Access API so the app takes the fallback paths. */
async function withoutFileSystemAccess(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w['showOpenFilePicker'];
    delete w['showSaveFilePicker'];
  });
}

test.describe('files without the File System Access API (spec 02 §13 fallback)', () => {
  test.beforeEach(async ({ page }) => withoutFileSystemAccess(page));

  test('Open Code opens the file in a new tab named after it', async ({ page }) => {
    await page.goto('/');
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open Sourcecode' }).click();
    await (
      await chooser
    ).setFiles({
      name: 'prog.asm',
      mimeType: 'text/plain',
      buffer: Buffer.from('mov eax, 5\r\nhlt\r\n'),
    });
    await expect(tab(page, 'prog.asm')).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveTitle('Jasmin - prog.asm');
    await expect(page.getByLabel('Program code')).toContainText('mov eax, 5');
    await expect(page.locator('.tab .modified')).toHaveCount(0);
    await step(page);
    await expect(eax(page)).toHaveValue('5');
  });

  test('Save Code downloads <title>.asm and retitles the tab', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 1');
    await expect(page.locator('.tab .modified')).toHaveCount(1);
    const download = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    const file = await download;
    expect(file.suggestedFilename()).toBe('new program.asm');
    expect(await downloaded(file)).toBe('mov eax, 1');
    await expect(tab(page, 'new program.asm')).toBeVisible();
    await expect(page.locator('.tab .modified')).toHaveCount(0);
  });

  test('Save Memory and Load Memory round-trip the machine state', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 42');
    await step(page);
    await expect(eax(page)).toHaveValue('42');

    const download = page.waitForEvent('download');
    await fileMenu(page, 'Save Memory');
    const file = await download;
    expect(file.suggestedFilename()).toBe('new program.mem');
    const memory = await downloaded(file);
    expect(JSON.parse(memory)).toMatchObject({ format: 'jasmin-mem', version: 1 });

    // A fresh document, then load the saved state into it.
    await page.keyboard.press('Alt+n');
    await expect(eax(page)).toHaveValue('0');
    const chooser = page.waitForEvent('filechooser');
    await fileMenu(page, 'Load Memory');
    await (
      await chooser
    ).setFiles({ name: 'state.mem', mimeType: 'text/plain', buffer: Buffer.from(memory) });
    await expect(eax(page)).toHaveValue('42');
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
  });

  test('Load Memory of another file shows "Not a Jasmin memory file."', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 7');
    await step(page);
    const chooser = page.waitForEvent('filechooser');
    await fileMenu(page, 'Load Memory');
    await (
      await chooser
    ).setFiles({ name: 'prog.asm', mimeType: 'text/plain', buffer: Buffer.from('mov eax, 1') });

    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(NOT_A_MEMORY_FILE);
    await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused();
    await dialog.getByRole('button', { name: 'OK' }).click();
    await expect(dialog).toHaveCount(0);
    // Nothing changed.
    await expect(eax(page)).toHaveValue('7');
  });
});

/**
 * A fake File System Access API: files live in `window.__files`; the save
 * picker returns `window.__nextSaveName` and records each picker call.
 */
async function withFakeFileSystemAccess(page: Page, files: Record<string, string>) {
  await page.addInitScript((initial) => {
    const w = window as unknown as Record<string, unknown>;
    const store: Record<string, string> = { ...initial };
    const calls: string[] = [];
    w['__files'] = store;
    w['__calls'] = calls;
    const handle = (name: string) => ({
      name,
      kind: 'file',
      getFile: async () => new File([store[name] ?? ''], name),
      createWritable: async () => {
        let buffer = '';
        return {
          write: async (data: string) => void (buffer += data),
          close: async () => void (store[name] = buffer),
        };
      },
      queryPermission: async () => 'granted',
      requestPermission: async () => 'granted',
    });
    w['showOpenFilePicker'] = async (options: { id: string }) => {
      calls.push(`open ${options.id}`);
      return [handle(w['__nextOpenName'] as string)];
    };
    w['showSaveFilePicker'] = async (options: { id: string; suggestedName: string }) => {
      calls.push(`save ${options.id} ${options.suggestedName}`);
      return handle((w['__nextSaveName'] as string | undefined) ?? options.suggestedName);
    };
  }, files);
}

test.describe('files with the File System Access API (remembered handles)', () => {
  test('Save Code writes back to the opened file; Ctrl+Shift+S saves as', async ({ page }) => {
    await withFakeFileSystemAccess(page, { 'prog.asm': 'nop' });
    await page.goto('/');
    await page.evaluate(
      () => ((window as unknown as Record<string, unknown>)['__nextOpenName'] = 'prog.asm'),
    );
    await page.keyboard.press('Control+o');
    await expect(tab(page, 'prog.asm')).toHaveAttribute('aria-selected', 'true');

    const editor = page.getByLabel('Program code');
    await editor.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('mov eax, 2');
    await expect(editor).toHaveText('mov eax, 2');
    await expect(page.locator('.tab .modified')).toHaveCount(1);
    await page.keyboard.press('Control+s');
    await expect(page.locator('.tab .modified')).toHaveCount(0);
    const state = () =>
      page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        return { files: w['__files'], calls: w['__calls'] };
      });
    expect(await state()).toEqual({
      files: { 'prog.asm': 'mov eax, 2' },
      calls: ['open jasmin-asm'],
    });

    await page.evaluate(
      () => ((window as unknown as Record<string, unknown>)['__nextSaveName'] = 'copy.asm'),
    );
    await page.keyboard.press('Control+Shift+s');
    await expect(tab(page, 'copy.asm')).toBeVisible();
    expect(await state()).toEqual({
      files: { 'prog.asm': 'mov eax, 2', 'copy.asm': 'mov eax, 2' },
      calls: ['open jasmin-asm', 'save jasmin-asm prog.asm'],
    });
  });

  test('Save Memory always asks, suggesting <title>.mem', async ({ page }) => {
    await withFakeFileSystemAccess(page, {});
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 3');
    await step(page);
    await fileMenu(page, 'Save Memory');
    await expect
      .poll(() => page.evaluate(() => (window as unknown as Record<string, unknown>)['__calls']))
      .toEqual(['save jasmin-mem new program.mem']);
    const saved = await page.evaluate(
      () => (window as unknown as { __files: Record<string, string> }).__files['new program.mem'],
    );
    expect(JSON.parse(saved)).toMatchObject({ format: 'jasmin-mem' });
  });
});

test.describe('unsaved edits (07 Q-UI-5)', () => {
  /** Counts the window's live `beforeunload` listeners. */
  async function countBeforeUnload(page: Page): Promise<void> {
    await page.addInitScript(() => {
      const live = new Set<unknown>();
      const add = window.addEventListener.bind(window);
      const remove = window.removeEventListener.bind(window);
      window.addEventListener = ((type: string, listener: unknown, options?: unknown) => {
        if (type === 'beforeunload') live.add(listener);
        add(type, listener as EventListener, options as AddEventListenerOptions);
      }) as typeof window.addEventListener;
      window.removeEventListener = ((type: string, listener: unknown, options?: unknown) => {
        if (type === 'beforeunload') live.delete(listener);
        remove(type, listener as EventListener, options as EventListenerOptions);
      }) as typeof window.removeEventListener;
      (window as unknown as { __beforeUnload: () => number }).__beforeUnload = () => live.size;
    });
  }

  const listeners = (page: Page) =>
    page.evaluate(() => (window as unknown as { __beforeUnload: () => number }).__beforeUnload());

  test('beforeunload is registered only while a document has unsaved edits', async ({ page }) => {
    await withoutFileSystemAccess(page);
    await countBeforeUnload(page);
    await openNewDocument(page);
    // The dev server registers its own listener; count the app's on top of it.
    const base = await listeners(page);
    await setProgram(page, 'nop');
    await expect.poll(() => listeners(page)).toBe(base + 1);
    const download = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    await download;
    await expect.poll(() => listeners(page)).toBe(base);
    await page.getByLabel('Program code').click();
    await page.keyboard.type('hlt');
    await expect.poll(() => listeners(page)).toBe(base + 1);
    await fileMenu(page, 'Close Document');
    await expect.poll(() => listeners(page)).toBe(base);
  });

  test('leaving with unsaved edits asks the browser to confirm', async ({ page }) => {
    await openNewDocument(page);
    await page.getByLabel('Program code').click();
    await page.keyboard.type('nop');
    const dialog = page.waitForEvent('dialog');
    await page.close({ runBeforeUnload: true });
    const prompt = await dialog;
    expect(prompt.type()).toBe('beforeunload');
    await prompt.accept();
  });
});
