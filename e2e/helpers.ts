import { Page } from '@playwright/test';

/**
 * Replaces the program text of the current document. Written against the M4
 * textarea editor; when the CodeMirror editor lands, only this helper changes.
 */
export async function setProgram(page: Page, text: string): Promise<void> {
  await page.getByRole('textbox', { name: 'Program code' }).fill(text);
}

/** Opens the app with a new document. `settings` are stored before the app loads. */
export async function openNewDocument(
  page: Page,
  settings: Record<string, unknown> = {},
): Promise<void> {
  if (Object.keys(settings).length > 0) {
    await page.addInitScript(
      (stored) => localStorage.setItem('jasmin.settings', JSON.stringify(stored)),
      settings,
    );
  }
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  await page.getByRole('region', { name: 'Memory' }).waitFor();
}
