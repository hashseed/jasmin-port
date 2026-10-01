import { Page, expect, test } from '@playwright/test';
import { openNewDocument, setProgram } from './helpers';

/** The collapsed field of a register, or a byte field (`EAX byte 0`). */
const field = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Registers', exact: true })
    .getByRole('textbox', { name, exact: true });

const memoryRow = (page: Page, address: number) =>
  page.locator(`app-memory-panel .row[data-address="${address}"]`);

const step = (page: Page) =>
  page.getByRole('button', { name: 'Execute the next command', exact: true }).click();

async function editField(page: Page, name: string, text: string): Promise<void> {
  const input = page.getByRole('textbox', { name, exact: true });
  await input.fill(text);
  await input.press('Enter');
}

test.describe('registers panel (spec 02 §7)', () => {
  test('format toggles change the display radix', async ({ page }) => {
    await openNewDocument(page);
    const formats = page.getByRole('radiogroup', { name: 'Register format' });
    await expect(formats.getByRole('radio')).toHaveText(['bin', '±dec', 'dec', 'hex']);
    await expect(formats.getByRole('radio', { name: '±dec' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await setProgram(page, 'mov eax, -1');
    await step(page);
    const eax = field(page, 'EAX');
    await expect(eax).toHaveValue('-1');
    await formats.getByRole('radio', { name: 'dec', exact: true }).click();
    await expect(eax).toHaveValue('4294967295');
    await formats.getByRole('radio', { name: 'hex' }).click();
    await expect(eax).toHaveValue('0xFFFFFFFF');
    await expect(field(page, 'ESP')).toHaveValue('0x00001000');
    await formats.getByRole('radio', { name: 'bin' }).click();
    await expect(eax).toHaveValue('1'.repeat(32));
    await expect(field(page, 'EBX')).toHaveValue('0');
  });

  test('expanding a register shows its bytes with the EAX/AX/AH/AL labels', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 0x12345678');
    await step(page);
    await page.getByRole('radio', { name: 'hex' }).click();
    const expand = page.getByRole('button', { name: 'Expand EAX' });
    await expand.click();
    const row = page.locator('[data-register="EAX"]');
    await expect(row.locator('.label.named')).toHaveText(['AX', 'AH', 'AL']);
    await expect(row.locator('.label.e')).toHaveText('EAX');
    await expect(field(page, 'EAX byte 3')).toHaveValue('0x12');
    await expect(field(page, 'EAX byte 0')).toHaveValue('0x78');
    await expect(field(page, 'EAX')).toHaveCount(0);

    await page.getByRole('button', { name: 'Expand ESI' }).click();
    await expect(page.locator('[data-register="ESI"] .label.named')).toHaveText(['SI']);
    await page.getByRole('button', { name: 'Expand EIP' }).click();
    await expect(page.locator('[data-register="EIP"] .label.named')).toHaveCount(0);

    await page.getByRole('button', { name: 'Collapse EAX' }).click();
    await expect(field(page, 'EAX')).toHaveValue('0x12345678');
  });

  test('an edited register is used by the next Step', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov ebx, eax\nadd ebx, ecx');
    await editField(page, 'EAX', '7');
    await expect(field(page, 'EAX')).toHaveValue('7');
    // Literal forms work in every radix; the field shows the stored value.
    await editField(page, 'ECX', '0x10');
    await expect(field(page, 'ECX')).toHaveValue('16');
    await step(page);
    await expect(field(page, 'EBX')).toHaveValue('7');
    await step(page);
    await expect(field(page, 'EBX')).toHaveValue('23');
    // Invalid input is ignored and the field reverts.
    await editField(page, 'EBX', 'nonsense');
    await expect(field(page, 'EBX')).toHaveValue('23');
  });

  test('a byte field replaces only its byte, in the current radix', async ({ page }) => {
    await openNewDocument(page);
    await page.getByRole('radio', { name: 'hex' }).click();
    await editField(page, 'EDX', 'AABBCCDD');
    await page.getByRole('button', { name: 'Expand EDX' }).click();
    await editField(page, 'EDX byte 1', '11');
    await page.getByRole('button', { name: 'Collapse EDX' }).click();
    await expect(field(page, 'EDX')).toHaveValue('0xAABB11DD');
  });

  test('changed registers are bold after a step, per byte when expanded', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 1\nmov al, 2\nnop');
    await page.getByRole('button', { name: 'Expand EAX' }).click();
    await step(page);
    for (const byte of [0, 1, 2, 3]) {
      await expect(field(page, `EAX byte ${byte}`)).toHaveClass(/changed/);
    }
    await expect(field(page, 'EBX')).not.toHaveClass(/changed/);
    await step(page);
    await expect(field(page, 'EAX byte 0')).toHaveClass(/changed/);
    await expect(field(page, 'EAX byte 1')).not.toHaveClass(/changed/);
    await expect(field(page, 'EAX byte 3')).not.toHaveClass(/changed/);
    await page.getByRole('button', { name: 'Collapse EAX' }).click();
    await expect(field(page, 'EAX')).toHaveClass(/changed/);
    await step(page);
    await expect(field(page, 'EAX')).not.toHaveClass(/changed/);
    await expect(field(page, 'EIP')).toHaveClass(/changed/);
  });
});

test.describe('flags (spec 02 §8)', () => {
  test('the checkboxes are in spec order and set the flag', async ({ page }) => {
    await openNewDocument(page);
    const flags = page.getByRole('group', { name: 'Flags' });
    await expect(flags.locator('label')).toHaveText([
      'Carry',
      'Overflow',
      'Sign',
      'Zero',
      'Parity',
      'Auxiliary',
      'Trap',
      'Direction',
    ]);
    await setProgram(page, 'adc eax, 0\ncmp eax, eax');
    const carry = flags.getByRole('checkbox', { name: 'Carry' });
    await carry.check();
    await expect(carry).toBeChecked();
    await step(page);
    await expect(field(page, 'EAX')).toHaveValue('1');
    await expect(carry).not.toBeChecked();
    await step(page);
    await expect(flags.getByRole('checkbox', { name: 'Zero' })).toBeChecked();
  });
});

test.describe('FPU panel (spec 02 §9)', () => {
  test('eight rows, ST0 bold, values editable', async ({ page }) => {
    await openNewDocument(page);
    const fpu = page.getByRole('region', { name: 'FPU Registers' });
    await expect(fpu.locator('tbody th')).toHaveText([
      'ST0',
      'ST1',
      'ST2',
      'ST3',
      'ST4',
      'ST5',
      'ST6',
      'ST7',
    ]);
    await expect(fpu.locator('tr.top th')).toHaveText('ST0');
    const st2 = fpu.getByRole('textbox', { name: 'ST2 value' });
    await expect(st2).toHaveValue('0.0');
    await st2.fill('2.5');
    await st2.press('Enter');
    await expect(st2).toHaveValue('2.5');
    await st2.fill('abc');
    await st2.press('Enter');
    await expect(st2).toHaveValue('2.5');
    await st2.fill('1e10');
    await st2.press('Tab');
    await expect(st2).toHaveValue('1.0E10');
  });
});

test.describe('memory panel (spec 02 §10)', () => {
  test('toolbar toggles and widths', async ({ page }) => {
    await openNewDocument(page);
    const memory = page.getByRole('region', { name: 'Memory' });
    await expect(memory.getByRole('group', { name: 'Memory view' }).getByRole('button')).toHaveText(
      ['desc', 'hex', 'highlight'],
    );
    await expect(
      memory.getByRole('radiogroup', { name: 'Cell width' }).getByRole('radio'),
    ).toHaveText(['8 Bit', '16Bit', '32Bit']);
    await expect(memory.getByRole('columnheader')).toHaveText([
      'address',
      'signed int',
      'unsigned int',
      'hex',
    ]);
    await expect(memory.getByRole('rowheader').first()).toHaveText('0x0');
    await expect(memory.getByRole('rowheader').nth(1)).toHaveText('0x4');
    await memory.getByRole('radio', { name: '16Bit' }).click();
    await expect(memory.getByRole('rowheader').nth(1)).toHaveText('0x2');
    await expect(memory.getByRole('textbox', { name: 'hex at 0x2', exact: true })).toHaveValue(
      '0x0000',
    );
    await memory.getByRole('button', { name: 'hex', exact: true }).click();
    await expect(memory.getByRole('rowheader').nth(5)).toHaveText('10');
    await memory.getByRole('button', { name: 'desc' }).click();
    await expect(memory.getByRole('rowheader').first()).toHaveText('4094');
  });

  test('an edited memory cell is used by the next Step', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, [4]');
    await editField(page, 'hex at 0x4', 'ff');
    await expect(
      page.getByRole('textbox', { name: 'unsigned int at 0x4', exact: true }),
    ).toHaveValue('255');
    await editField(page, 'signed int at 0x8', '-2');
    await expect(page.getByRole('textbox', { name: 'hex at 0x8', exact: true })).toHaveValue(
      '0xFFFFFFFE',
    );
    await step(page);
    await expect(field(page, 'EAX')).toHaveValue('255');
  });

  test('rows written by the last step are bold', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov eax, 7\nmov [8], al\nnop');
    await step(page);
    await step(page);
    await expect(memoryRow(page, 8)).toHaveClass(/changed/);
    await expect(memoryRow(page, 4)).not.toHaveClass(/changed/);
    await expect(memoryRow(page, 8).getByRole('textbox').first()).toHaveValue('7');
    await step(page);
    await expect(memoryRow(page, 8)).not.toHaveClass(/changed/);
  });

  test('the stack is tinted from ESP to the end of memory', async ({ page }) => {
    await openNewDocument(page);
    await page.getByRole('button', { name: 'desc' }).click();
    await expect(memoryRow(page, 4092)).not.toHaveClass(/stack/);
    await setProgram(page, 'push 5');
    await step(page);
    await expect(memoryRow(page, 4092)).toHaveClass(/stack/);
    await expect(memoryRow(page, 4092)).toHaveClass(/changed/);
    await expect(memoryRow(page, 4088)).not.toHaveClass(/stack/);
    await expect(memoryRow(page, 4092).getByRole('textbox').first()).toHaveValue('5');
  });

  test('highlight colors rows and fields of registers pointing into memory', async ({ page }) => {
    await openNewDocument(page);
    await setProgram(page, 'mov esi, 8\nmov eax, 8\nmov ebx, 4');
    await step(page);
    await page.getByRole('button', { name: 'highlight' }).click();
    await expect(memoryRow(page, 8)).toHaveAttribute('style', /--reg-esi/);
    await expect(field(page, 'ESI')).toHaveAttribute('style', /--reg-esi/);
    await expect(field(page, 'ESP')).not.toHaveAttribute('style', /--reg/);
    await step(page);
    await step(page);
    // EAX comes first in panel order.
    await expect(memoryRow(page, 8)).toHaveAttribute('style', /--reg-eax/);
    await expect(memoryRow(page, 4)).toHaveAttribute('style', /--reg-ebx/);
    await page.getByRole('button', { name: 'highlight' }).click();
    await expect(memoryRow(page, 8)).not.toHaveAttribute('style', /--reg/);
  });

  test('a multi-megabyte memory scrolls to its last byte', async ({ page }) => {
    await openNewDocument(page, { memory: 4 * 1024 * 1024 });
    const memory = page.getByRole('region', { name: 'Memory' });
    await memory.getByRole('radio', { name: '8 Bit' }).click();
    const viewport = memory.locator('cdk-virtual-scroll-viewport');
    await expect(memory.getByRole('rowheader').first()).toHaveText('0x0');

    await viewport.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
    await expect(memory.getByRole('rowheader').first()).not.toHaveText('0x0');
    const middle = Number(await memory.getByRole('rowheader').first().textContent());
    expect(Math.abs(middle - 0x200000)).toBeLessThan(0x1000);

    await viewport.evaluate((el) => (el.scrollTop = el.scrollHeight));
    const last = memory.getByRole('rowheader').filter({ hasText: /^0x3FFFFF$/ });
    await expect(last).toBeVisible();
    // Only the visible rows (plus a small buffer) are in the DOM.
    expect(await memory.getByRole('row').count()).toBeLessThan(100);

    // Mouse-wheel scrolling still moves row by row near the top.
    await viewport.evaluate((el) => (el.scrollTop = 0));
    await expect(memory.getByRole('rowheader').first()).toHaveText('0x0');
    await viewport.hover();
    await page.mouse.wheel(0, 200);
    await expect(memory.getByRole('rowheader').first()).not.toHaveText('0x0');

    // Changing the width scrolls back to the top.
    await memory.getByRole('radio', { name: '32Bit' }).click();
    await expect(memory.getByRole('rowheader').first()).toHaveText('0x0');
  });
});
