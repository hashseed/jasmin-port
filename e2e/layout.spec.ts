import { Page, expect, test } from '@playwright/test';

/** Size of the first pane of a split, along its direction. */
async function firstPaneSize(page: Page, split: string, axis: 'width' | 'height') {
  const box = await page.locator(`[data-split="${split}"] > .first`).first().boundingBox();
  return box?.[axis] ?? -1;
}

async function secondPaneSize(page: Page, split: string, axis: 'width' | 'height') {
  const box = await page.locator(`[data-split="${split}"] > .second`).first().boundingBox();
  return box?.[axis] ?? -1;
}

test.describe('document layout (spec 02 §5)', () => {
  test('default divider locations', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('region', { name: 'Memory' })).toBeVisible();
    expect(await firstPaneSize(page, 'split2', 'width')).toBe(300);
    // Memory about 350 px wide, the bottom tab pane about 350 px high.
    expect(Math.abs((await secondPaneSize(page, 'split1', 'width')) - 350)).toBeLessThanOrEqual(3);
    expect(Math.abs((await secondPaneSize(page, 'split4', 'height')) - 350)).toBeLessThanOrEqual(3);
  });

  test('panels sit in the original positions', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const box = async (name: string) =>
      (await page.getByRole('region', { name, exact: true }).boundingBox())!;
    const registers = await box('Registers');
    const fpu = await box('FPU Registers');
    const editor = await box('Editor');
    const memory = await box('Memory');
    const bottom = (await page.getByRole('tablist', { name: 'Tools' }).boundingBox())!;
    expect(fpu.y).toBeGreaterThan(registers.y);
    expect(editor.x).toBeGreaterThan(registers.x + registers.width - 1);
    expect(memory.x).toBeGreaterThan(editor.x + editor.width - 1);
    expect(bottom.y).toBeGreaterThan(editor.y + editor.height - 1);
    await expect(page.getByRole('tablist', { name: 'Tools' }).getByRole('tab')).toHaveText([
      'Help',
      '7-Segment',
      'StripLight',
      'Console',
      'Graphics',
    ]);
  });

  test('dragging a divider persists split2.location for new documents', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    const divider = page.locator('[data-split="split2"] > .divider').first();
    const box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + 1, box.y + 200);
    await page.mouse.down();
    await page.mouse.move(box.x + 61, box.y + 200, { steps: 5 });
    await page.mouse.up();
    expect(await firstPaneSize(page, 'split2', 'width')).toBe(360);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('jasmin.settings')!));
    expect(stored['split2.location']).toBe(360);

    await page.reload();
    await page.keyboard.press('Alt+n');
    expect(await firstPaneSize(page, 'split2', 'width')).toBe(360);
  });

  test('stored split locations are used for new documents', async ({ page }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'jasmin.settings',
        JSON.stringify({ 'split2.location': 250, 'split4.location': 200 }),
      ),
    );
    await page.goto('/');
    await page.keyboard.press('Alt+n');
    await expect(page.getByRole('region', { name: 'Editor' })).toBeVisible();
    expect(await firstPaneSize(page, 'split2', 'width')).toBe(250);
    expect(await firstPaneSize(page, 'split4', 'height')).toBe(200);
  });
});
