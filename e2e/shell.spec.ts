import { expect, test } from '@playwright/test';

test('the shell renders with the Jasmin title, menus and Welcome tab', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Jasmin');
  await expect(page.getByRole('navigation', { name: 'Main menu' })).toHaveText(/File\s*Edit\s*Run/);
  await expect(page.getByRole('tab', { name: 'Welcome' })).toBeVisible();
});
