import { Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

/** 2 + 2 * 500,000 = 1,000,002 executed instructions. */
const MILLION = ['mov ecx, 500000', 'mov eax, 0', 'l: add eax, 1', 'loop l'].join('\n');
/** Never ends: a tight loop with no JASMINSLEEP, so only time slicing keeps the tab alive. */
const FOREVER = ['l: add eax, 1', 'jmp l'].join('\n');

const runButton = (page: Page) => page.getByRole('toolbar').locator('[data-action="runPause"]');
const eaxField = (page: Page) =>
  page
    .getByRole('region', { name: 'Registers', exact: true })
    .getByRole('textbox', { name: 'EAX', exact: true });

test.describe('performance (docs/plan.md M9)', () => {
  test('a 1M-instruction loop completes in reasonable time', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, MILLION);
    const started = Date.now();
    await runButton(page).click();
    await expect(eaxField(page)).toHaveValue('500000', { timeout: 30_000 });
    await expect(runButton(page)).not.toHaveClass(/running/);
    const seconds = (Date.now() - started) / 1000;
    console.log(`1M instructions: ${seconds.toFixed(2)} s`);
    expect(seconds).toBeLessThan(10);
  });

  test('an endless loop stays pausable and the page responsive', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, FOREVER);
    await runButton(page).click();
    await expect(runButton(page)).toHaveClass(/running/);

    // The main thread keeps getting turns: timers fire close to on time.
    const lag = await page.evaluate(async () => {
      const worst: number[] = [];
      for (let i = 0; i < 20; i++) {
        const t0 = performance.now();
        await new Promise((r) => setTimeout(r, 0));
        worst.push(performance.now() - t0);
      }
      return Math.max(...worst);
    });
    console.log(`worst event-loop turn while running: ${lag.toFixed(1)} ms`);
    expect(lag).toBeLessThan(100);

    const clicked = Date.now();
    await runButton(page).click();
    await expect(runButton(page)).not.toHaveClass(/running/, { timeout: 2_000 });
    console.log(`pause took ${Date.now() - clicked} ms`);
    const eax = Number(await eaxField(page).inputValue());
    expect(eax).toBeGreaterThan(1000);
  });

  test('1 MB of memory scrolls with a small DOM', async ({ page }) => {
    await openNewDocument(page, { memory: 1024 * 1024 });
    const viewport = page.locator('app-memory-panel cdk-virtual-scroll-viewport');
    const rows = page.locator('app-memory-panel .row[data-address]');
    await expect(rows.first()).toHaveAttribute('data-address', '0');
    const initial = await rows.count();
    console.log(`1 MB memory: ${initial} rows in the DOM for ${(1024 * 1024) / 4} table rows`);
    expect(initial).toBeLessThan(150);

    // Scroll through the table in 60 frames and time them.
    const frames = await viewport.evaluate(async (el) => {
      const times: number[] = [];
      const max = el.scrollHeight - el.clientHeight;
      let last = performance.now();
      for (let i = 1; i <= 60; i++) {
        el.scrollTop = (max * i) / 60;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        const now = performance.now();
        times.push(now - last);
        last = now;
      }
      times.sort((a, b) => a - b);
      return { median: times[30], worst: times[59] };
    });
    console.log(
      `1 MB memory scroll: median frame ${frames.median.toFixed(1)} ms, worst ${frames.worst.toFixed(1)} ms`,
    );
    expect(frames.median).toBeLessThan(50);

    // At the bottom: the last row (0xFFFFC with 32-bit cells), still few DOM rows.
    await expect(rows.last()).toHaveAttribute('data-address', String(1024 * 1024 - 4));
    expect(await rows.count()).toBeLessThan(150);
  });
});
