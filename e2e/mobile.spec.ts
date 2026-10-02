import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test('on a phone the document stacks its sections without sideways scrolling', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Alt+n');
  const sections = ['Editor', 'Registers', 'Memory', 'FPU Registers'].map((name) =>
    page.locator(`app-panel-card[aria-label="${name}"]`),
  );
  await sections[2].waitFor();
  await expect(page.locator('[data-split]')).toHaveCount(0);

  const tops: number[] = [];
  for (const section of [...sections, page.locator('app-bottom-pane')]) {
    const box = (await section.boundingBox())!;
    expect(box.width).toBeGreaterThan(350);
    tops.push(box.y);
  }
  expect([...tops].sort((a, b) => a - b)).toEqual(tops);

  const [scrollWidth, width] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  expect(scrollWidth).toBe(width);
});

test('on a phone the Welcome page fits the width', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'New File' })).toBeVisible();
  const overflow = await page
    .locator('app-help-view')
    .evaluate((e) =>
      [...e.querySelectorAll('*')].some(
        (c) => c.scrollWidth > c.clientWidth + 1 && getComputedStyle(c).overflowX !== 'visible',
      ),
    );
  expect(overflow).toBe(false);
  const [scrollWidth, width] = await page.evaluate(() => [
    document.documentElement.scrollWidth,
    innerWidth,
  ]);
  expect(scrollWidth).toBe(width);
});
