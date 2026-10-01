import { Address, DataSpace, Op } from '../../../core';
import { MemoryColumn, formatAddress, formatHex, parseMemoryInput } from '../radix';
import { registerColor } from '../register-colors';
import { LAST_STEPS } from '../registers/register-view';

/** Cell width of the memory table in bytes (`8 Bit`, `16Bit`, `32Bit`). */
export type CellWidth = 1 | 2 | 4;

export const WIDTH_OPTIONS: readonly { readonly value: CellWidth; readonly label: string }[] = [
  { value: 1, label: '8 Bit' },
  { value: 2, label: '16Bit' },
  { value: 4, label: '32Bit' },
];

export interface MemoryTableOptions {
  readonly width: CellWidth;
  readonly descending: boolean;
  readonly hexAddress: boolean;
  readonly highlight: boolean;
}

/** One rendered row of the memory table (spec 02 §10.2). */
export interface MemoryRow {
  readonly address: number;
  readonly addressText: string;
  readonly signed: string;
  readonly unsigned: string;
  readonly hex: string;
  /** Bold: a byte of the row changed in the last step. */
  readonly changed: boolean;
  /** At or above ESP. */
  readonly stack: boolean;
  /** Highlight color of the register pointing here, or null. */
  readonly color: string | null;
}

export function memoryRowCount(dsp: DataSpace, width: CellWidth): number {
  return Math.floor(dsp.memorySize / width);
}

/** The first address of table row `row` (`MemoryTableModel.getRowIndex`). */
export function rowAddress(
  dsp: DataSpace,
  row: number,
  width: CellWidth,
  descending: boolean,
): number {
  const index = descending ? memoryRowCount(dsp, width) - 1 - row : row;
  return dsp.offset + index * width;
}

/** The register whose 32-bit value equals `address`, first in panel order, or null. */
function pointingRegister(dsp: DataSpace, address: number): string | null {
  for (const set of dsp.registerSets) {
    if (dsp.registers.get(set.E) === address) return set.names.E;
  }
  return null;
}

/** Rows `start` (inclusive) to `end` (exclusive) of the table. */
export function memoryRows(
  dsp: DataSpace,
  start: number,
  end: number,
  options: MemoryTableOptions,
): MemoryRow[] {
  const { width, descending, hexAddress, highlight } = options;
  const esp = dsp.registers.get(dsp.ESP);
  const count = memoryRowCount(dsp, width);
  const rows: MemoryRow[] = [];
  for (let row = Math.max(0, start); row < Math.min(end, count); row++) {
    const address = rowAddress(dsp, row, width, descending);
    const unsigned = Number(dsp.getUnsignedMemory(address, width));
    const pointer = highlight ? pointingRegister(dsp, address) : null;
    rows.push({
      address,
      addressText: formatAddress(address, hexAddress),
      signed: dsp.getSignedMemory(address, width).toString(),
      unsigned: String(unsigned),
      hex: formatHex(unsigned, width),
      changed: dsp.isDirty(new Address(Op.MEM, width, address), LAST_STEPS),
      stack: address >= esp,
      color: pointer ? registerColor(pointer) : null,
    });
  }
  return rows;
}

/**
 * Writes an edited cell as `width` bytes little-endian at `address`
 * (`MemoryTableModel.setValueAt`). Returns false for invalid text.
 */
export function writeMemory(
  dsp: DataSpace,
  address: number,
  width: CellWidth,
  column: MemoryColumn,
  text: string,
): boolean {
  const value = parseMemoryInput(text, column);
  if (value === null) return false;
  dsp.put(value, new Address(Op.MEM, width, address), null);
  return true;
}
