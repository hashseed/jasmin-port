import { Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

const tabs = (page: Page) => page.getByRole('tablist', { name: 'Open tabs' });
const renameField = (page: Page) => tabs(page).getByRole('textbox', { name: 'Rename tab' });

test.describe('renaming document tabs (port addition)', () => {
  test('double-click renames; the window title and Save follow', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as Record<string, unknown>;
      delete w['showOpenFilePicker'];
      delete w['showSaveFilePicker'];
    });
    await openNewDocument(page);
    await tabs(page).getByRole('tab', { name: 'new document' }).dblclick();
    const field = renameField(page);
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('new document');
    // The whole name is selected, so typing replaces it.
    await page.keyboard.type('  loop demo ');
    await page.keyboard.press('Enter');
    const renamed = tabs(page).getByRole('tab', { name: 'loop demo' });
    await expect(renamed).toBeFocused();
    await expect(renamed).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveTitle('Jasmin - loop demo');

    const download = page.waitForEvent('download');
    await page.keyboard.press('Control+s');
    expect((await download).suggestedFilename()).toBe('loop demo.asm');
  });

  test('Escape and an empty name keep the old title; blur commits', async ({ page }) => {
    await openNewDocument(page);
    const doc = tabs(page).getByRole('tab', { name: 'new document' });
    await doc.dblclick();
    await page.keyboard.type('discarded');
    await page.keyboard.press('Escape');
    await expect(renameField(page)).toHaveCount(0);
    await expect(doc).toBeFocused();

    await doc.dblclick();
    await renameField(page).fill('   ');
    await page.keyboard.press('Enter');
    await expect(doc).toBeVisible();
    await expect(page).toHaveTitle('Jasmin - new document');

    await doc.dblclick();
    await renameField(page).fill('by blur');
    await page.getByRole('textbox', { name: 'Program code' }).click();
    await expect(tabs(page).getByRole('tab', { name: 'by blur' })).toBeVisible();
    await expect(page).toHaveTitle('Jasmin - by blur');
  });

  test('help tabs cannot be renamed', async ({ page }) => {
    await page.goto('/');
    const welcome = tabs(page).getByRole('tab', { name: 'Welcome' });
    await welcome.dblclick();
    await expect(renameField(page)).toHaveCount(0);
    await welcome.focus();
    await page.keyboard.press('F2');
    await expect(renameField(page)).toHaveCount(0);
    await expect(welcome).toBeFocused();
  });

  test('F2 on a focused document tab starts renaming', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'nop');
    await tabs(page).getByRole('tab', { name: 'new document' }).focus();
    await page.keyboard.press('F2');
    await expect(renameField(page)).toBeFocused();
    await page.keyboard.type('via keyboard');
    // Undo in the field stays in the field; the program keeps its text.
    await page.keyboard.press('Control+z');
    await expect(page.locator('.cm-content')).toHaveText('nop');
    await renameField(page).fill('via keyboard');
    await page.keyboard.press('Enter');
    const renamed = tabs(page).getByRole('tab', { name: 'via keyboard' });
    await expect(renamed).toBeFocused();
    await expect(tabs(page).locator('[role=tab][tabindex="0"]')).toHaveCount(1);
    // Roving focus still works afterwards.
    await page.keyboard.press('ArrowLeft');
    await expect(tabs(page).getByRole('tab', { name: 'Welcome' })).toBeFocused();
  });
});
