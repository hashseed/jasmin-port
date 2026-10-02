import AxeBuilder from '@axe-core/playwright';
import { Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * Runs axe (WCAG 2.2 A/AA rules and best practices) and fails on serious or
 * critical violations. The editable value cells of the memory and FPU tables are
 * exempt from `target-size` (WCAG 2.5.8, 24 px): they keep the original's dense
 * table rows, and each value can also be reached and edited with the keyboard.
 */
async function expectNoSeriousViolations(page: Page, state: string): Promise<void> {
  const all = await new AxeBuilder({ page }).withTags(TAGS).disableRules(['target-size']).analyze();
  const targets = await new AxeBuilder({ page })
    .withRules(['target-size'])
    .exclude('app-memory-panel [role=table]')
    .exclude('app-fpu-panel table')
    .analyze();
  const violations = [...all.violations, ...targets.violations];
  const serious = violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(serious, `axe violations in ${state}`).toEqual([]);
}

const bottomTab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Tools' }).getByRole('tab', { name, exact: true });

for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`axe, ${colorScheme} theme`, () => {
    test.use({ colorScheme });

    test('welcome and configuration pages', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('tab', { name: 'Welcome' })).toBeVisible();
      await expectNoSeriousViolations(page, 'welcome');
      await page.getByRole('link', { name: 'Configuration' }).first().click();
      await expect(page.getByRole('heading', { name: 'Configuration' })).toBeVisible();
      await expectNoSeriousViolations(page, 'configuration');
    });

    test('document: empty, stepped with expanded registers and highlight, menus', async ({
      page,
    }) => {
      await openNewDocument(page);
      await expectNoSeriousViolations(page, 'empty document');

      await setProgram(
        page,
        'start:\n  mov eax, 4 ; four\n  push eax\n  add eax, ebx\n  jmp start\nx: db 5\nk: equ 3\nbad',
      );
      for (let i = 0; i < 3; i++) {
        await page.getByRole('button', { name: 'Execute the next command', exact: true }).click();
      }
      await page.getByRole('button', { name: 'Expand EAX' }).click();
      await page.getByRole('button', { name: 'Expand ESI' }).click();
      await page.getByRole('button', { name: 'highlight' }).click();
      await expectNoSeriousViolations(page, 'stepped document');

      await page.getByRole('menuitem', { name: 'File' }).click();
      await expect(page.getByRole('menu', { name: 'File' })).toBeVisible();
      await expectNoSeriousViolations(page, 'File menu open');
      await page.keyboard.press('Escape');
    });

    test('device tabs and a device dialog', async ({ page }) => {
      await openNewDocument(page);
      for (const name of ['7-Segment', 'StripLight', 'Console', 'Graphics']) {
        await bottomTab(page, name).click();
        await expect(bottomTab(page, name)).toHaveAttribute('aria-selected', 'true');
        await expectNoSeriousViolations(page, `${name} tab`);
      }
      await bottomTab(page, '7-Segment').click();
      await page.locator('app-seven-segment-view canvas').click({ button: 'right' });
      await page.getByRole('menuitem', { name: 'Change color' }).click();
      await expect(page.getByRole('dialog', { name: 'Choose the color:' })).toBeVisible();
      await expectNoSeriousViolations(page, 'choice dialog');
    });
  });
}

test.describe('keyboard-only use', () => {
  test('F10 focuses the menu bar; arrows and Enter open menus; F10 returns', async ({ page }) => {
    await openNewDocument(page);
    const code = page.getByRole('textbox', { name: 'Program code' });
    await code.click();
    await page.keyboard.press('F10');
    const file = page.getByRole('menuitem', { name: 'File' });
    await expect(file).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menu', { name: 'Edit' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Edit' })).toHaveCount(0);
    await page.keyboard.press('F10');
    await expect(code).toBeFocused();
  });

  test('tab strip: one tab stop, arrows select, Delete closes', async ({ page }) => {
    await openNewDocument(page);
    const tabs = page.getByRole('tablist', { name: 'Open tabs' });
    const doc = tabs.getByRole('tab', { name: /new program/ });
    await doc.focus();
    await page.keyboard.press('ArrowLeft');
    await expect(tabs.getByRole('tab', { name: 'Welcome' })).toBeFocused();
    await expect(tabs.getByRole('tab', { name: 'Welcome' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await page.keyboard.press('End');
    await expect(doc).toBeFocused();
    await expect(doc).toHaveAttribute('aria-selected', 'true');
    await expect(tabs.locator('[role=tab][tabindex="0"]')).toHaveCount(1);
    await page.keyboard.press('Home');
    await page.keyboard.press('Delete');
    await expect(tabs.getByRole('tab')).toHaveCount(1);
    await expect(doc).toBeFocused();
  });

  test('toolbar: one tab stop, arrows move between enabled buttons', async ({ page }) => {
    await openNewDocument(page);
    const toolbar = page.getByRole('toolbar', { name: 'Toolbar' });
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await toolbar.locator('button[tabindex="0"]').focus();
    await expect(toolbar.locator('[data-action="new"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.locator('[data-action="open"]')).toBeFocused();
    await page.keyboard.press('End');
    await expect(toolbar.locator('[data-action="takeSnapshot"]')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.locator('[data-action="new"]')).toBeFocused();
    // Disabled buttons are skipped: Undo/Redo/Cut/Copy are disabled in a fresh document.
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.locator('[data-action="paste"]')).toBeFocused();
    await page.keyboard.press('Enter');
  });

  test('bottom tabs: Up/Down select; the panel is focusable', async ({ page }) => {
    await openNewDocument(page);
    await bottomTab(page, 'Help').focus();
    await page.keyboard.press('ArrowDown');
    await expect(bottomTab(page, '7-Segment')).toBeFocused();
    await expect(bottomTab(page, '7-Segment')).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect(bottomTab(page, 'Graphics')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('tabpanel', { name: 'Graphics' })).toBeFocused();
  });

  test('editor: Tab inserts a tab, Escape then Tab leaves; F8 toggles a breakpoint', async ({
    page,
  }) => {
    await openNewDocument(page);
    const code = page.getByRole('textbox', { name: 'Program code' });
    await setProgram(page, 'mov eax, 1\nmov ebx, 2');
    await code.press('Control+End');
    await page.keyboard.press('F8');
    await expect(page.locator('.jas-has-breakpoint')).toHaveCount(1);
    await page.keyboard.press('Tab');
    await expect(code).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(code).not.toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(code).toBeFocused();
    await page.keyboard.press('F8');
    await expect(page.locator('.jas-has-breakpoint')).toHaveCount(0);
  });

  test('split dividers move with the arrow keys', async ({ page }) => {
    await openNewDocument(page);
    const divider = page.getByRole('separator', { name: 'Resize left column' });
    await divider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(divider).toHaveAttribute('aria-valuenow', '310');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(divider).toHaveAttribute('aria-valuenow', '260');
  });

  test('dialogs take focus and return it', async ({ page }) => {
    await openNewDocument(page);
    await bottomTab(page, '7-Segment').click();
    const canvas = page.locator('app-seven-segment-view canvas');
    await canvas.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change digits' }).click();
    const prompt = page.getByRole('dialog', { name: 'Please enter the number of digits: (1-8)' });
    await expect(prompt.getByRole('textbox')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(prompt).toHaveCount(0);
  });
});
