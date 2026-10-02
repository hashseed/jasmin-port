import { Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

/** 2 + 2 * 500,000 = 1,000,002 executed instructions. */
const MILLION = ['mov ecx, 500000', 'mov eax, 0', 'l: add eax, 1', 'loop l'].join('\n');
/** Never ends: a tight loop with no JASMINSLEEP, so only time slicing keeps the tab alive. */
const FOREVER = ['l: add eax, 1', 'jmp l'].join('\n');

/** Never ends either; Run executes it as compiled code (spec 04 §9.3 port note). */
const FOREVER_TWO = ['l: add eax, 1', 'add ebx, 2', 'jmp l'].join('\n');

const runButton = (page: Page) => page.getByRole('toolbar').locator('[data-action="runPause"]');
const registerField = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Registers', exact: true })
    .getByRole('textbox', { name, exact: true });
const eaxField = (page: Page) => registerField(page, 'EAX');
const registerValue = async (page: Page, name: string) =>
  Number(await registerField(page, name).inputValue());

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

    // The registers follow the run while it is in progress.
    const first = Number(await eaxField(page).inputValue());
    await expect
      .poll(async () => Number(await eaxField(page).inputValue()), { timeout: 2_000 })
      .toBeGreaterThan(first);
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

  test('a compiled endless loop pauses with the exact state, and Step continues it', async ({
    page,
  }) => {
    await openNewDocument(page);
    await setProgram(page, FOREVER_TWO);
    await runButton(page).click();
    await expect(runButton(page)).toHaveClass(/running/);

    // The registers follow the run while it is in progress.
    const first = await registerValue(page, 'EBX');
    await expect.poll(() => registerValue(page, 'EBX'), { timeout: 2_000 }).toBeGreaterThan(first);

    const clicked = Date.now();
    await runButton(page).click();
    await expect(runButton(page)).not.toHaveClass(/running/, { timeout: 2_000 });
    console.log(`compiled loop: pause took ${Date.now() - clicked} ms`);

    // Paused between two lines: EBX = 2 * EAX, less 2 if the ADD EBX is next (32-bit).
    const state = async () => ({
      eip: await registerValue(page, 'EIP'),
      eax: await registerValue(page, 'EAX'),
      ebx: await registerValue(page, 'EBX'),
    });
    const consistent = ({ eip, eax, ebx }: { eip: number; eax: number; ebx: number }) =>
      (2 * eax - (eip === 1 ? 2 : 0) - ebx) % 2 ** 32 === 0;
    let before = await state();
    expect([0, 1, 2]).toContain(before.eip);
    expect(before.eax).toBeGreaterThan(1000);
    expect(consistent(before)).toBe(true);

    // Step continues exactly where Run stopped.
    for (let k = 0; k < 4; k++) {
      await page.keyboard.press('F7');
      const expected = {
        eip: (before.eip + 1) % 3,
        eax: before.eip === 0 ? (before.eax + 1) % 2 ** 32 : before.eax,
        ebx: before.eip === 1 ? (before.ebx + 2) % 2 ** 32 : before.ebx,
      };
      await expect.poll(state).toEqual(expected);
      before = expected;
      expect(consistent(before)).toBe(true);
    }
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
