import { expect, Page } from '@playwright/test';

/** The editor's text, line by line as CodeMirror renders it. */
async function programText(page: Page): Promise<string> {
  const lines = await page.locator('.cm-content .cm-line').allTextContents();
  return lines.join('\n').replaceAll('\u200b', '');
}

/**
 * Replaces the program text of the current document. When focus moves into the
 * editor, CodeMirror restores its previous selection asynchronously; under load
 * that can land after `fill` selected everything, so the new text is inserted
 * next to the old one instead of replacing it. Retry until the editor shows
 * exactly `text`.
 */
export async function setProgram(page: Page, text: string): Promise<void> {
  const editor = page.getByRole('textbox', { name: 'Program code' });
  await expect(async () => {
    await editor.fill(text);
    expect(await programText(page)).toBe(text);
  }).toPass({ timeout: 10_000 });
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
