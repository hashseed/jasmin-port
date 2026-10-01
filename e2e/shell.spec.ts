import { expect, test } from '@playwright/test';

test('the shell renders with the Jasmin title, menus and Welcome tab', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Jasmin');
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveText(/File\s*Edit\s*Run/);
  await expect(page.getByRole('tab', { name: 'Welcome' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('toolbar', { name: 'Toolbar' }).getByRole('button')).toHaveCount(17);
});

test('toolbar tooltips keep the original texts plus the shortcut', async ({ page }) => {
  await page.goto('/');
  const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
  await expect(toolbar.getByRole('button', { name: 'Create a new Document' })).toHaveAttribute(
    'title',
    'Create a new Document (Alt+N)',
  );
  await expect(toolbar.getByRole('button', { name: 'Run the program' })).toHaveAttribute(
    'title',
    'Run the program (F5)',
  );
  await expect(toolbar.getByRole('button', { name: 'Stop the program' })).toHaveAttribute(
    'title',
    'Stop the program',
  );
});

test('menus show their shortcuts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'File' }).click();
  const file = page.getByRole('menu', { name: 'File' });
  await expect(file.getByRole('menuitem')).toHaveText([
    /New\s*Alt\+N/,
    /Open Code\s*Ctrl\+O/,
    /Save Code\s*Ctrl\+S/,
    'Save Memory',
    'Load Memory',
    'Close Document',
    'Configuration',
    'Exit',
  ]);
});

test('New creates "new document" tabs and sets the window title', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('menuitem', { name: 'File' }).click();
  await page.getByRole('menuitem', { name: 'New' }).click();
  await expect(page.getByRole('tab', { name: 'new document' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page).toHaveTitle('Jasmin - new document');

  await page.keyboard.press('Alt+n');
  await expect(page.getByRole('tab', { name: 'new document' })).toHaveCount(2);

  // Selecting a help tab keeps the title (spec 02 §1).
  await page.getByRole('tab', { name: 'Welcome' }).click();
  await expect(page).toHaveTitle('Jasmin - new document');
});

test('right-clicking the tab strip offers Close Tab for the selected tab', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  await page.getByRole('tablist', { name: 'Open tabs' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close Tab' }).click();
  await expect(page.getByRole('tab')).toHaveText(['Welcome']);
  await expect(page.getByRole('tab', { name: 'Welcome' })).toHaveAttribute('aria-selected', 'true');
});

test('Step, Run, Pause and Reset drive the document session', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  const registers = page.getByRole('region', { name: 'Registers', exact: true });
  const register = (name: string) => registers.getByRole('textbox', { name, exact: true });
  await page.getByLabel('Program code').fill('mov eax, 4\nmov ebx, 6');
  await page.keyboard.press('F7');
  await expect(register('EAX')).toHaveValue('4');
  await expect(register('EIP')).toHaveValue('1');
  await page.keyboard.press('F5');
  await expect(register('EBX')).toHaveValue('6');
  await page.getByRole('button', { name: 'Reset the memory and all registers' }).click();
  await expect(register('EAX')).toHaveValue('0');
  await expect(register('EIP')).toHaveValue('0');
});

test('Ctrl+Z and Ctrl+Y undo and redo editor changes', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  const editor = page.getByLabel('Program code');
  await editor.click();
  await editor.pressSequentially('nop');
  await expect(editor).toHaveText('nop');
  await page.keyboard.press('Control+z');
  await expect(editor).toHaveText('no');
  await page.keyboard.press('Control+y');
  await expect(editor).toHaveText('nop');
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor).toHaveText('nop');
});
