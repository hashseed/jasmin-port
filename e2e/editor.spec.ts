import { Locator, Page, expect, test } from '@playwright/test';

/** Opens a new document and replaces its text. */
async function newDocument(page: Page, text: string): Promise<Locator> {
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  const editor = page.getByLabel('Program code');
  await editor.fill(text);
  return editor;
}

const row = (page: Page, index: number) =>
  page.locator(`.jas-gutter .jas-row[data-row="${index}"]`);
const markedRow = (page: Page) => page.locator('.jas-gutter .jas-row.jas-exec-row');
const errorLine = (page: Page) => page.getByRole('status', { name: 'Error' });

test.describe('editor (spec 02 §6)', () => {
  test('highlights from the parse results', async ({ page }) => {
    const editor = await newDocument(
      page,
      'n: equ 3\nv: dd 0\nstart: mov eax, n ; load\nmov [v], eax\njmp start',
    );
    await expect(editor.locator('.jas-mnemonic', { hasText: 'mov' }).first()).toBeVisible();
    await expect(editor.locator('.jas-register', { hasText: 'eax' }).first()).toBeVisible();
    await expect(editor.locator('.jas-label', { hasText: 'start' })).toHaveCount(2);
    await expect(editor.locator('.jas-constant', { hasText: 'n' })).toHaveCount(2);
    await expect(editor.locator('.jas-variable', { hasText: 'v' })).toHaveCount(2);
    await expect(editor.locator('.jas-comment')).toHaveText('; load');
    // The mnemonic is bold in the token color.
    const mnemonic = editor.locator('.jas-mnemonic').first();
    await expect(mnemonic).toHaveCSS('font-weight', '700');
  });

  test('numbers the gutter from 0 and fills the viewport with empty rows', async ({ page }) => {
    await newDocument(page, 'nop\nnop');
    await expect(row(page, 0)).toContainText('0');
    await expect(row(page, 1)).toContainText('1');
    // Rows continue below the last line.
    await expect(row(page, 5)).toBeVisible();
    await expect(markedRow(page)).toHaveAttribute('data-row', '0');
  });

  test('Step moves the execution mark', async ({ page }) => {
    const editor = await newDocument(page, 'mov eax, 1\nmov ebx, 2\nmov ecx, 3');
    await page.keyboard.press('F7');
    await expect(markedRow(page)).toHaveAttribute('data-row', '1');
    await expect(editor.locator('.cm-line.jas-exec-line')).toHaveText('mov ebx, 2');
    await page.keyboard.press('F7');
    await page.keyboard.press('F7');
    // Past the last line, the mark sits on the first empty row.
    await expect(markedRow(page)).toHaveAttribute('data-row', '3');
    await expect(editor.locator('.cm-line.jas-exec-line')).toHaveCount(0);
  });

  test('breakpoints stop Run and move with their line', async ({ page }) => {
    const editor = await newDocument(page, 'mov eax, 1\nmov ebx, 2\nmov ecx, 3\nmov edx, 4');
    await row(page, 2).click();
    await expect(row(page, 2)).toHaveClass(/jas-has-breakpoint/);
    await page.keyboard.press('F5');
    await expect(markedRow(page)).toHaveAttribute('data-row', '2');

    // Insert a line above: the breakpoint moves down with its line (07 Q-UI-2).
    await editor.locator('.cm-line').first().click();
    await page.keyboard.press('Home');
    await page.keyboard.type('nop');
    await page.keyboard.press('Enter');
    await expect(row(page, 3)).toHaveClass(/jas-has-breakpoint/);
    await expect(row(page, 2)).not.toHaveClass(/jas-has-breakpoint/);

    // Clicking again removes it.
    await row(page, 3).click();
    await expect(page.locator('.jas-has-breakpoint')).toHaveCount(0);
  });

  test('right-click on the gutter sets EIP', async ({ page }) => {
    await newDocument(page, 'nop\nnop\nnop\nnop');
    await row(page, 3).click({ button: 'right' });
    await expect(markedRow(page)).toHaveAttribute('data-row', '3');
    // No context menu opens on the gutter.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await page.keyboard.press('F7');
    await expect(markedRow(page)).toHaveAttribute('data-row', '4');
  });

  test('is read-only while running', async ({ page }) => {
    const editor = await newDocument(page, 'l: JASMINSLEEP 50\njmp l');
    await page.keyboard.press('F5');
    await expect(editor).not.toBeEditable();
    await expect(editor).toHaveAttribute('contenteditable', 'false');
    await page.keyboard.press('Control+p');
    await expect(editor).toBeEditable();
    await expect(editor).toContainText('jmp l');
  });

  test('error line shows parse errors at the caret and runtime errors', async ({ page }) => {
    const editor = await newDocument(page, 'foo eax\nmov ebx, 0\ndiv ebx');
    await expect(editor.locator('.jas-error')).toHaveText('foo');
    await editor.locator('.cm-line').first().click();
    await expect(errorLine(page)).not.toBeEmpty();
    // A line without a parse error clears it.
    await editor.locator('.cm-line').nth(1).click();
    await expect(errorLine(page)).toBeEmpty();
    // Step hits the parse error of line 0.
    await page.keyboard.press('F7');
    await expect(errorLine(page)).not.toBeEmpty();
    await page.getByRole('button', { name: 'Reset the memory and all registers' }).click();
    await expect(errorLine(page)).toBeEmpty();
    // Runtime error: division by zero.
    await row(page, 1).click({ button: 'right' });
    await page.keyboard.press('F7');
    await page.keyboard.press('F7');
    await expect(errorLine(page)).not.toBeEmpty();
  });

  test('auto-indent copies the leading whitespace', async ({ page }) => {
    const editor = await newDocument(page, '');
    await editor.click();
    await page.keyboard.type('    mov eax, 1');
    await page.keyboard.press('Enter');
    await page.keyboard.type('nop');
    await expect(editor.locator('.cm-line').nth(1)).toHaveText('    nop');
  });

  test('context menu has the Edit commands', async ({ page }) => {
    const editor = await newDocument(page, 'nop');
    await editor.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Editor' });
    await expect(menu.locator('[data-action="undo"]')).toBeEnabled();
    await expect(menu.locator('[data-action="cut"]')).toBeDisabled();
    await expect(menu.locator('[data-action="paste"]')).toBeEnabled();
    await menu.locator('[data-action="undo"]').click();
    await expect(editor).not.toContainText('nop');
  });

  test('the error line sits inside the editor card: gaps match the other dividers', async ({
    page,
  }) => {
    await newDocument(page, 'nop');
    const box = async (name: string) =>
      (await page.getByRole('region', { name, exact: true }).boundingBox())!;
    const editor = await box('Editor');
    const registers = await box('Registers');
    const bottom = (await page.locator('app-bottom-pane').first().boundingBox())!;
    await expect(page.getByRole('region', { name: 'Editor' }).getByRole('status')).toBeVisible();
    // Editor card -> bottom pane, across the split4 divider.
    const editorGap = bottom.y - (editor.y + editor.height);
    // Registers column -> editor card, across the split2 divider.
    const columnGap = editor.x - (registers.x + registers.width);
    expect(Math.abs(editorGap - columnGap)).toBeLessThanOrEqual(1);
  });
});
