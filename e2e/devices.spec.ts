import { Locator, Page, expect, test } from '@playwright/test';
import { DEVICE_COLORS, darken } from '../src/app/devices/color';
import { graphicsLayout, pixelRect } from '../src/app/devices/graphics';
import { sevenSegmentLayout } from '../src/app/devices/seven-segment';
import { stripLightLayout } from '../src/app/devices/strip-light';
import { openNewDocument, setProgram } from './helpers';

/** The emcelettronica tutorial program (spec 06 §1): bytes 07 06 3F 5B, display `2017`. */
const EXAMPLE_2017 = [
  'mov ebx,0',
  'mov [ebx],7',
  'mov ebx,1',
  'mov [ebx],6',
  'mov ebx,2',
  'mov [ebx],63',
  'mov ebx,3',
  'mov [ebx],91',
].join('\n');

const SCREENSHOT =
  '/tmp/claude-0/-home-claude/69ae3818-a3bc-570b-8200-11823b7508e5/scratchpad/m7-7seg.png';

const bottomTab = (page: Page, name: string) =>
  page.getByRole('tablist', { name: 'Tools' }).getByRole('tab', { name, exact: true });

const run = async (page: Page) => {
  await page.getByRole('button', { name: 'Run the program', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run the program', exact: true })).toBeVisible();
};

const reset = (page: Page) =>
  page.getByRole('button', { name: 'Reset the memory and all registers', exact: true }).click();

const hexAt = (page: Page, address: number) =>
  page.getByRole('textbox', {
    name: `hex at 0x${address.toString(16).toUpperCase()}`,
    exact: true,
  });

/** The canvas's CSS size (the layout functions work in CSS pixels). */
async function canvasSize(canvas: Locator): Promise<{ width: number; height: number }> {
  return canvas.evaluate((el) => {
    const host = el.parentElement as HTMLElement;
    return { width: Math.floor(host.clientWidth), height: Math.floor(host.clientHeight) };
  });
}

/** The RGB color drawn at a CSS-pixel point of a canvas. */
async function colorAt(canvas: Locator, x: number, y: number): Promise<[number, number, number]> {
  return canvas.evaluate(
    (el, [px, py]) => {
      const c = el as HTMLCanvasElement;
      const ratio = c.width / c.getBoundingClientRect().width;
      const d = c
        .getContext('2d')!
        .getImageData(Math.floor(px * ratio), Math.floor(py * ratio), 1, 1).data;
      return [d[0], d[1], d[2]] as [number, number, number];
    },
    [x, y],
  );
}

const rgb = ({ r, g, b }: { r: number; g: number; b: number }) => [r, g, b];
const ON_COLORS = [rgb(DEVICE_COLORS.blue), rgb(DEVICE_COLORS.jasmin)];
const OFF_COLORS = [rgb(darken(DEVICE_COLORS.blue, 0.2)), rgb(darken(DEVICE_COLORS.jasmin, 0.2))];

test.describe('I/O devices (spec 06)', () => {
  test('7-Segment shows 2017 for the emcelettronica example; clicks toggle bits', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openNewDocument(page);
    await setProgram(page, EXAMPLE_2017);
    await run(page);
    await bottomTab(page, '7-Segment').click();
    const canvas = page.getByRole('img', { name: '7-Segment display' });
    // Digits left to right: 2, 0, 1, 7.
    await expect(canvas).toHaveAttribute('data-state', 'abdeg abcdef bc abc');
    await expect(hexAt(page, 0)).toHaveValue('0x5B3F0607');

    // Pixels: the middle segment (g) of the leftmost digit is lit, its upper left (f) is not.
    const { width, height } = await canvasSize(canvas);
    const layout = sevenSegmentLayout(width, height, 4)!;
    const center = (digit: number, segment: number) => {
      const p = layout.segments.find((s) => s.digit === digit && s.segment === segment)!.polygon;
      const xs = p.map((q) => q.x);
      const ys = p.map((q) => q.y);
      return {
        x: (Math.min(...xs) + Math.max(...xs)) / 2,
        y: (Math.min(...ys) + Math.max(...ys)) / 2,
      };
    };
    const g = center(3, 6);
    const f = center(3, 5);
    expect(ON_COLORS).toContainEqual(await colorAt(canvas, g.x, g.y));
    expect(OFF_COLORS).toContainEqual(await colorAt(canvas, f.x, f.y));
    await page.locator('app-bottom-pane').screenshot({ path: SCREENSHOT });

    // Clicking segment d of the rightmost digit sets bit 3 of byte 0.
    const d = center(0, 3);
    const box = (await canvas.boundingBox())!;
    await page.mouse.click(box.x + d.x, box.y + d.y);
    await expect(canvas).toHaveAttribute('data-state', 'abdeg abcdef bc abcd');
    await expect(hexAt(page, 0)).toHaveValue('0x5B3F060F');
    await page.mouse.click(box.x + d.x, box.y + d.y);
    await expect(hexAt(page, 0)).toHaveValue('0x5B3F0607');

    // Reset clears memory, so the display goes dark.
    await reset(page);
    await expect(canvas).toHaveAttribute('data-state', '- - - -');
  });

  test('7-Segment menu: Change digits validates with the spec texts', async ({ page }) => {
    await openNewDocument(page);
    await bottomTab(page, '7-Segment').click();
    const canvas = page.getByRole('img', { name: '7-Segment display' });
    await canvas.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '7-Segment' });
    await expect(menu.getByRole('menuitem')).toHaveText([
      'Change address',
      'Change digits',
      'Change color',
    ]);
    await menu.getByRole('menuitem', { name: 'Change digits' }).click();
    const prompt = page.getByRole('dialog', { name: 'Please enter the number of digits: (1-8)' });
    await expect(prompt.getByRole('textbox')).toHaveValue('4');
    await prompt.getByRole('textbox').fill('9');
    await prompt.getByRole('button', { name: 'OK' }).click();
    const message = page.getByRole('dialog', { name: 'The entered value was not valid!' });
    await message.getByRole('button', { name: 'OK' }).click();
    await expect(message).toBeHidden();
    await expect(canvas).toHaveAttribute('data-state', '- - - -');

    await canvas.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change digits' }).click();
    await prompt.getByRole('textbox').fill('2');
    await prompt.getByRole('textbox').press('Enter');
    await expect(canvas).toHaveAttribute('data-state', '- -');

    await canvas.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change address' }).click();
    const address = page.getByRole('dialog', {
      name: 'Please enter a new address for the display to use:',
    });
    await expect(address.getByRole('textbox')).toHaveValue('0x0');
    await address.getByRole('textbox').fill('10h');
    await address.getByRole('button', { name: 'OK' }).click();
    await setProgram(page, 'mov word [16], 0x063F');
    await page.getByRole('button', { name: 'Execute the next command', exact: true }).click();
    await expect(canvas).toHaveAttribute('data-state', 'bc abcdef');

    await canvas.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change color' }).click();
    const choice = page.getByRole('dialog', { name: 'Choose the color:' });
    await expect(choice.getByRole('button')).toHaveText(['blue', 'jasmin', 'Cancel']);
    await choice.getByRole('button', { name: 'jasmin' }).click();
    const { width, height } = await canvasSize(canvas);
    const a = sevenSegmentLayout(width, height, 2)!.segments.find(
      (s) => s.digit === 0 && s.segment === 0,
    )!.polygon;
    await expect
      .poll(() => colorAt(canvas, (a[0].x + a[3].x) / 2, a[0].y))
      .toEqual(rgb(DEVICE_COLORS.jasmin));
  });

  test('StripLight shows bits right to left and toggles lamps', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov word [0], 0x8001');
    await page.getByRole('button', { name: 'Execute the next command', exact: true }).click();
    await bottomTab(page, 'StripLight').click();
    const canvas = page.getByRole('img', { name: 'StripLight lamps' });
    await expect(canvas).toHaveAttribute('data-state', '1000000000000001');
    const { width, height } = await canvasSize(canvas);
    const lamp = stripLightLayout(width, height, 16)!.lamps[1].rect;
    await canvas.click({ position: { x: lamp.x + lamp.width / 2, y: lamp.y + lamp.height / 2 } });
    await expect(canvas).toHaveAttribute('data-state', '1000000000000011');
    await expect(hexAt(page, 0)).toHaveValue('0x00008003');
    await canvas.click({ button: 'right' });
    await expect(page.getByRole('menu', { name: 'StripLight' }).getByRole('menuitem')).toHaveText([
      'Change address',
      'Change digits',
    ]);
    await page.getByRole('menuitem', { name: 'Change digits' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Please enter the number of bars: (1-32)' }),
    ).toBeVisible();
  });

  test('Console prints strings written by a program, in both modes; Reset clears it', async ({
    page,
  }) => {
    await openNewDocument(page);
    await bottomTab(page, 'Console').click();
    const output = page.getByRole('textbox', { name: 'Console output' });

    // Array-based (default): the zero-terminated string at the address.
    await setProgram(page, "mov byte [0], 'O'\nmov byte [1], 'K'\nmov byte [2], '!'");
    await run(page);
    await expect(output).toHaveValue('OK!');

    // Pipe-like: every byte written to the address is typed.
    await output.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: 'Console' });
    await expect(menu.getByRole('menuitem')).toHaveText(['Change Address', 'Change Mode', 'Clear']);
    await expect(menu.getByRole('menuitem', { name: 'Clear' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await menu.getByRole('menuitem', { name: 'Change Mode' }).click();
    const choice = page.getByRole('dialog', { name: 'Choose the input mode' });
    await expect(choice.getByRole('button')).toHaveText(['Array-based', 'Pipe-like', 'Cancel']);
    await choice.getByRole('button', { name: 'Pipe-like' }).click();
    await expect(output).toHaveValue('');

    await setProgram(
      page,
      [
        "mov al, 'H'",
        'mov [100], al',
        "mov al, 'i'",
        'mov [100], al',
        'mov al, 10',
        'mov [100], al',
        "mov al, '?'",
        'mov [100], al',
        'mov al, 8',
        'mov [100], al',
        "mov al, '!'",
        'mov [100], al',
      ].join('\n'),
    );
    await output.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change Address' }).click();
    const address = page.getByRole('dialog', {
      name: 'Please enter a new address for the console to use:',
    });
    await address.getByRole('textbox').fill('100');
    await address.getByRole('button', { name: 'OK' }).click();
    await page.getByRole('button', { name: 'Stop the program', exact: true }).click();
    await run(page);
    await expect(output).toHaveValue('Hi\n!');

    // Pipe writes while another tab is shown still arrive.
    await bottomTab(page, 'Graphics').click();
    await page.getByRole('button', { name: 'Stop the program', exact: true }).click();
    await run(page);
    await bottomTab(page, 'Console').click();
    await expect(output).toHaveValue('Hi\n!Hi\n!');

    await reset(page);
    await expect(output).toHaveValue('');
  });

  test('Graphics shows pixels set by a program; Binary clicks toggle bits', async ({ page }) => {
    await openNewDocument(page);
    // Pixel (1, 0) = bit 1 of byte 0; pixel (0, 1) = bit 0 of byte 2.
    await setProgram(page, 'mov byte [0], 2\nmov byte [2], 1');
    await run(page);
    await bottomTab(page, 'Graphics').click();
    const canvas = page.getByRole('img', { name: 'Graphics display' });
    await expect(canvas).toHaveAttribute('data-state', '16x16 Binary');
    const { width, height } = await canvasSize(canvas);
    const layout = graphicsLayout(width, height, 16, 16)!;
    const centerOf = (x: number, y: number) => {
      const r = pixelRect(layout, x, y);
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    };
    const at = (x: number, y: number) => {
      const c = centerOf(x, y);
      return colorAt(canvas, c.x, c.y);
    };
    await expect.poll(() => at(1, 0)).not.toEqual(await at(0, 0));
    expect(ON_COLORS).toContainEqual(await at(1, 0));
    expect(ON_COLORS).toContainEqual(await at(0, 1));
    expect(OFF_COLORS).toContainEqual(await at(0, 0));

    await canvas.click({ position: centerOf(0, 0) });
    await expect(hexAt(page, 0)).toHaveValue('0x00010003');
    await expect.poll(() => at(0, 0)).toEqual(await at(1, 0));

    // 8 Colors: the low nibble 3 of byte 0 is yellow (red + green).
    await canvas.click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Change color mode' }).click();
    const choice = page.getByRole('dialog', { name: 'Choose the color mode:' });
    await expect(choice.getByRole('button')).toHaveText([
      'Binary',
      '8 Colors',
      'TrueColor',
      'Cancel',
    ]);
    await choice.getByRole('button', { name: '8 Colors' }).click();
    await expect(canvas).toHaveAttribute('data-state', '16x16 8 Colors');
    await expect.poll(() => at(0, 0)).toEqual([255, 255, 0]);

    await reset(page);
    await expect.poll(() => at(0, 0)).toEqual([0, 0, 0]);
  });
});
