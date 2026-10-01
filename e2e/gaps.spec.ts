import { expect, test } from '@playwright/test';
import { openNewDocument } from './helpers';

/**
 * Every gap between the sections of a document (and between a section and the
 * edge of the document area) has the same width.
 */
test('all gaps between sections are equal', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await openNewDocument(page);
  const box = async (selector: string) => {
    const b = await page.locator(selector).first().boundingBox();
    if (!b) throw new Error(`no box for ${selector}`);
    return b;
  };
  const card = (heading: string) => `app-document-view app-panel-card[aria-label="${heading}"]`;
  const area = await box('app-document-view');
  const registers = await box(card('Registers'));
  const fpu = await box(card('FPU Registers'));
  const editor = await box(card('Editor'));
  const memory = await box(card('Memory'));
  const bottom = await box('app-document-view app-bottom-pane');

  const gaps = {
    'edge → registers (left)': registers.x - area.x,
    'edge → registers (top)': registers.y - area.y,
    'registers → fpu': fpu.y - (registers.y + registers.height),
    'fpu → edge (bottom)': area.y + area.height - (fpu.y + fpu.height),
    'registers → editor': editor.x - (registers.x + registers.width),
    'edge → editor (top)': editor.y - area.y,
    'editor → bottom pane': bottom.y - (editor.y + editor.height),
    'bottom pane → edge': area.y + area.height - (bottom.y + bottom.height),
    'editor → memory': memory.x - (editor.x + editor.width),
    'edge → memory (top)': memory.y - area.y,
    'memory → edge (right)': area.x + area.width - (memory.x + memory.width),
    'memory → edge (bottom)': area.y + area.height - (memory.y + memory.height),
  };
  const expected = gaps['registers → editor'];
  expect(expected).toBeGreaterThan(0);
  for (const [name, gap] of Object.entries(gaps)) {
    expect.soft(gap, name).toBeCloseTo(expected, 0);
  }
});
