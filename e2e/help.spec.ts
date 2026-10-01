import { Page, expect, test } from '@playwright/test';

const helpPane = (page: Page) => page.getByRole('tabpanel', { name: 'Help', exact: true });
const toolbarButton = (page: Page, action: 'back' | 'forward') =>
  page.getByRole('toolbar', { name: 'Toolbar' }).locator(`[data-action="${action}"]`);
const helpLinks = (page: Page) =>
  page.locator('[role=tabpanel]:visible').getByRole('navigation', { name: 'Help links' });

test.describe('context help (spec 02 §11)', () => {
  test('follows the caret line', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const editor = page.getByLabel('Program code');
    await editor.fill('mov eax, 1\nfabs\n\nfoo eax\nl: loop l');

    // The caret is on the last line: LOOP, with the ECX fix (07 Q-I-14).
    await expect(helpPane(page)).toContainText('LOOP-Loop while ECX is not zero');
    await expect(helpPane(page)).toContainText('copying N to ECX (MOV ECX,N)');

    await page.keyboard.press('Control+Home');
    await expect(helpPane(page)).toContainText('Command: MOV-Move');
    // Restyled to the app's typography: no inline styles from the page.
    await expect(helpPane(page).locator('[style]')).toHaveCount(0);

    await page.keyboard.press('ArrowDown');
    await expect(helpPane(page)).toHaveText('No help found for FABS');
    await page.keyboard.press('ArrowDown');
    await expect(helpPane(page)).toHaveText('No help available for current context.');
    await page.keyboard.press('ArrowDown');
    await expect(helpPane(page)).toHaveText('No help available for current context.');
  });

  test('re-reads the line when it is edited', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const editor = page.getByLabel('Program code');
    await editor.pressSequentially('ad');
    await expect(helpPane(page)).toHaveText('No help available for current context.');
    await editor.pressSequentially('d eax, 1');
    await expect(helpPane(page)).toContainText('Command: ADD-Integer Addition');
  });
});

test.describe('help tabs (spec 02 §12)', () => {
  test('Welcome links: New File creates a document, Open File opens one', async ({ page }) => {
    // Use the <input type=file> fallback so Playwright sees a file chooser.
    await page.addInitScript(() => {
      delete (window as unknown as Record<string, unknown>)['showOpenFilePicker'];
    });
    await page.goto('/');
    await expect(page.getByRole('img', { name: 'Jasmin' })).toBeVisible();
    await helpLinks(page).getByRole('link', { name: 'New File' }).click();
    await expect(page.getByRole('tab', { name: 'new document' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await page.getByRole('tab', { name: 'Welcome' }).click();
    const chooser = page.waitForEvent('filechooser');
    await helpLinks(page).getByRole('link', { name: 'Open File' }).click();
    await (
      await chooser
    ).setFiles({ name: 'prog.asm', mimeType: 'text/plain', buffer: Buffer.from('nop') });
    await expect(page.getByRole('tab', { name: 'prog.asm' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  test('Welcome shows the credits with a port line', async ({ page }) => {
    await page.goto('/');
    const welcome = page.locator('app-help-view');
    await expect(welcome).toContainText('Version 1.5.11 (2016-10-28)');
    await expect(welcome).toContainText('Web port: version');
    await expect(welcome).toContainText('Lehrstuhl für Rechnertechnik und Rechnerorganisation');
    await helpLinks(page).getByRole('link', { name: 'Credits' }).click();
    await expect(welcome.locator('[data-anchor="credits"]')).toBeInViewport();
  });

  test('links navigate within the tab; Back and Forward follow its history', async ({ page }) => {
    await page.goto('/');
    const back = toolbarButton(page, 'back');
    const forward = toolbarButton(page, 'forward');
    await expect(back).toBeDisabled();

    await helpLinks(page).getByRole('link', { name: 'Configuration' }).click();
    await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
    // Still the Welcome tab, which keeps its title.
    await expect(page.getByRole('tab')).toHaveText(['Welcome']);
    await expect(back).toBeEnabled();
    await expect(forward).toBeDisabled();

    await back.click();
    await expect(helpLinks(page).getByRole('link', { name: 'Configuration' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Configuration' })).toHaveCount(0);
    await expect(back).toBeDisabled();
    await expect(forward).toBeEnabled();

    await forward.click();
    await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();

    // Credits on the Configuration page goes to Welcome.htm#credits.
    await helpLinks(page).getByRole('link', { name: 'Credits' }).click();
    await expect(page.locator('[data-anchor="credits"]')).toBeInViewport();
    await back.click();
    await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();

    // Each help tab has its own history.
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Configuration' }).click();
    await expect(page.getByRole('tab', { name: 'Configuration' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(back).toBeDisabled();
    await page.getByRole('tab', { name: 'Welcome' }).click();
    await expect(back).toBeEnabled();
  });

  test('Configuration edits the settings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.getByRole('menuitem', { name: 'Configuration' }).click();

    await page.getByLabel('Theme:').selectOption('Dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.getByLabel('Theme:').selectOption('System');
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);

    await page.getByLabel('Font:').selectOption('Inter');
    await page.getByLabel('Size:').fill('16');
    await page.getByLabel('Size:').press('Tab');
    await page.getByLabel('Simulated Memory Size (bytes): (default is 4096)').fill('8192');
    await page.getByLabel('Simulated Memory Size (bytes): (default is 4096)').press('Tab');
    const offset = page.getByLabel('Start address of the usable memory:');
    await offset.fill('0x100');
    await offset.press('Enter');
    await expect(offset).toHaveValue('256');
    await offset.fill('junk');
    await offset.press('Enter');
    await expect(offset).toHaveValue('256');

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('jasmin.settings') ?? '{}'),
    );
    expect(stored).toMatchObject({
      font: 'Inter',
      'font.size': 16,
      memory: 8192,
      offset: 256,
      theme: 'system',
    });

    // Documents opened afterwards use the new memory size and offset.
    await page.keyboard.press('Alt+n');
    const registers = page.getByRole('region', { name: 'Registers', exact: true });
    await expect(registers.getByRole('textbox', { name: 'ESP', exact: true })).toHaveValue(
      String(256 + 8192),
    );
  });
});
