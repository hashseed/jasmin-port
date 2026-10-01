import { Page, expect, test } from '@playwright/test';

/**
 * The enablement table of spec 02 §4 (MainFrame.checkButtonStates) with 07
 * Q-UI-1 applied, in the three shell states: help tab, document idle and
 * document running.
 */

const TOOLBAR = [
  'new',
  'open',
  'save',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'back',
  'forward',
  'runPause',
  'step',
  'executeLine',
  'stop',
  'reset',
  'takeSnapshot',
  'loadSnapshot',
] as const;

const FILE_MENU = [
  'new',
  'open',
  'save',
  'saveMemory',
  'loadMemory',
  'closeDocument',
  'configuration',
  'exit',
] as const;
const EDIT_MENU = ['undo', 'redo', 'cut', 'copy', 'paste'] as const;
const RUN_MENU = ['run', 'pause', 'step', 'executeLine'] as const;

interface Expected {
  toolbar: readonly string[];
  file: readonly string[];
  /** null: the Edit menu itself is disabled. */
  edit: readonly string[] | null;
  run: readonly string[] | null;
}

const HELP_TAB: Expected = {
  toolbar: ['new', 'open'],
  file: ['new', 'open', 'loadMemory', 'configuration', 'exit'],
  edit: null,
  run: null,
};

const DOCUMENT_IDLE: Expected = {
  toolbar: [
    'new',
    'open',
    'save',
    'paste',
    'runPause',
    'step',
    'executeLine',
    'stop',
    'reset',
    'takeSnapshot',
  ],
  file: [...FILE_MENU],
  edit: ['paste'],
  run: ['run', 'step', 'executeLine'],
};

const DOCUMENT_RUNNING: Expected = {
  toolbar: ['new', 'open', 'runPause', 'stop', 'reset'],
  file: ['new', 'open', 'loadMemory', 'configuration', 'exit'],
  edit: null,
  run: ['pause'],
};

async function expectEnabled(page: Page, expected: Expected): Promise<void> {
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  for (const id of TOOLBAR) {
    const button = toolbar.locator(`[data-action="${id}"]`);
    if (expected.toolbar.includes(id)) await expect(button, id).toBeEnabled();
    else await expect(button, id).toBeDisabled();
  }
  await expectMenu(page, 'File', FILE_MENU, expected.file);
  await expectMenu(page, 'Edit', EDIT_MENU, expected.edit);
  await expectMenu(page, 'Run', RUN_MENU, expected.run);
}

async function expectMenu(
  page: Page,
  name: string,
  items: readonly string[],
  enabled: readonly string[] | null,
): Promise<void> {
  const trigger = page.getByRole('menubar').getByRole('menuitem', { name, exact: true });
  if (enabled === null) {
    await expect(trigger, `${name} menu`).toBeDisabled();
    return;
  }
  await expect(trigger, `${name} menu`).toBeEnabled();
  await trigger.click();
  const menu = page.getByRole('menu', { name });
  await expect(menu).toBeVisible();
  for (const id of items) {
    const item = menu.locator(`[data-action="${id}"]`);
    if (enabled.includes(id)) await expect(item, `${name} > ${id}`).toBeEnabled();
    else await expect(item, `${name} > ${id}`).toBeDisabled();
  }
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
}

/** A program that keeps running (sleeping most of the time) until paused. */
const ENDLESS = 'l: JASMINSLEEP 50\njmp l';

test.describe('enablement (spec 02 §4)', () => {
  test('help tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Welcome' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expectEnabled(page, HELP_TAB);
  });

  test('document idle', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    await expect(page.getByLabel('Program code')).toBeEditable();
    await expectEnabled(page, DOCUMENT_IDLE);
  });

  test('document idle: undo, cut/copy and load snapshot follow the document', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
    const editor = page.getByLabel('Program code');
    await editor.pressSequentially('nop');
    await expect(toolbar.locator('[data-action="undo"]')).toBeEnabled();
    await expect(toolbar.locator('[data-action="cut"]')).toBeDisabled();
    await editor.selectText();
    await expect(toolbar.locator('[data-action="cut"]')).toBeEnabled();
    await expect(toolbar.locator('[data-action="copy"]')).toBeEnabled();
    await expect(toolbar.locator('[data-action="loadSnapshot"]')).toBeDisabled();
    await toolbar.locator('[data-action="takeSnapshot"]').click();
    await expect(toolbar.locator('[data-action="loadSnapshot"]')).toBeEnabled();
  });

  test('document running', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const editor = page.getByLabel('Program code');
    await editor.fill(ENDLESS);
    await editor.selectText();
    await page.keyboard.press('F5');
    const runPause = page.getByRole('toolbar').locator('[data-action="runPause"]');
    await expect(runPause).toHaveClass(/running/);
    await expect(editor).not.toBeEditable();
    await expectEnabled(page, DOCUMENT_RUNNING);

    // Pause from the Run menu (07 Q-UI-1), then the document is idle again.
    await page.getByRole('menubar').getByRole('menuitem', { name: 'Run', exact: true }).click();
    await page.getByRole('menu', { name: 'Run' }).locator('[data-action="pause"]').click();
    await expect(runPause).not.toHaveClass(/running/);
    await expect(editor).toBeEditable();
  });

  test('Ctrl+P pauses and Stop works while running', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    await page.getByLabel('Program code').fill(ENDLESS);
    const runPause = page.getByRole('toolbar').locator('[data-action="runPause"]');
    await runPause.click();
    await expect(runPause).toHaveClass(/running/);
    await page.keyboard.press('Control+p');
    await expect(runPause).not.toHaveClass(/running/);
    await runPause.click();
    await expect(runPause).toHaveClass(/running/);
    await page.getByRole('button', { name: 'Stop the program' }).click();
    await expect(runPause).not.toHaveClass(/running/);
    await expect(page.getByRole('region', { name: 'Registers', exact: true })).toContainText(
      'EIP:0',
    );
  });
});
