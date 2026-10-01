import { NumberFormatError, parseLong } from '../../core/java';
import { hex2dec } from '../../core/number-literals';

/** Display and edit radix of the register fields (spec 02 §7.1). */
export type Radix = 'bin' | 'sdec' | 'dec' | 'hex';

/** The format toggles in their original order, with the original labels. */
export const RADIX_OPTIONS: readonly { readonly value: Radix; readonly label: string }[] = [
  { value: 'bin', label: 'bin' },
  { value: 'sdec', label: '±dec' },
  { value: 'dec', label: 'dec' },
  { value: 'hex', label: 'hex' },
];

/** `0x` + uppercase hex zero-padded to `2 * size` digits. */
export function formatHex(value: number, size: number): string {
  return (
    '0x' +
    (value >>> 0)
      .toString(16)
      .toUpperCase()
      .padStart(2 * size, '0')
  );
}

/** Two's complement of `size` bytes. */
export function toSigned(value: number, size: number): number {
  const shift = 32 - 8 * size;
  return ((value << shift) >> shift) | 0;
}

/**
 * A register value `value` (unsigned, `size` bytes) in the given radix
 * (spec 02 §7.1, `DataSpace.getString`).
 */
export function formatValue(value: number, size: number, radix: Radix): string {
  const unsigned = size === 4 ? value >>> 0 : (value >>> 0) & (2 ** (8 * size) - 1);
  switch (radix) {
    case 'bin':
      return unsigned.toString(2);
    case 'sdec':
      return String(toSigned(unsigned, size));
    case 'dec':
      return String(unsigned);
    case 'hex':
      return formatHex(unsigned, size);
  }
}

/**
 * Any number literal of spec 03 §3 (decimal with optional sign, `0x..`, `..h`,
 * `$..`, `..b`, `..o`, `..q`) as a 64-bit value, or null if `text` is not one.
 */
export function parseLiteral(text: string): bigint | null {
  const upper = text.trim().toUpperCase();
  if (upper === '') return null;
  const decimal = hex2dec(upper);
  if (!/^[+-]?[0-9]+$/.test(decimal)) return null;
  try {
    return parseLong(decimal);
  } catch (error) {
    if (error instanceof NumberFormatError) return null;
    throw error;
  }
}

/**
 * Parses a register field in the current radix (spec 02 §7.2): hex accepts
 * digits with or without `0x`, bin accepts digits with or without a trailing
 * `b`, the decimal modes take a decimal number, and every mode also accepts any
 * literal form. Returns null for invalid input.
 */
export function parseValue(text: string, radix: Radix): bigint | null {
  const s = text.trim().toUpperCase();
  if (radix === 'hex' && /^[+-]?[0-9A-F]+$/.test(s)) {
    const sign = /^[+-]/.test(s) ? s[0] : '';
    return parseLiteral(`${sign}0X${s.slice(sign.length)}`);
  }
  if (radix === 'bin' && /^[+-]?[01]+$/.test(s)) return parseLiteral(`${s}B`);
  return parseLiteral(s);
}

/** Which value column of the memory table a cell belongs to (spec 02 §10.2). */
export type MemoryColumn = 'signed' | 'unsigned' | 'hex';

/**
 * Parses a memory cell edit (`DataSpace.putString`): any literal form; in the
 * `hex` column a missing `0x` is added (unless the text has an `h` suffix).
 */
export function parseMemoryInput(text: string, column: MemoryColumn): bigint | null {
  const s = text.trim().toUpperCase();
  if (column === 'hex' && !(s.startsWith('0X') || s.endsWith('H') || s.startsWith('-'))) {
    return parseLiteral(`0X${s}`);
  }
  return parseLiteral(s);
}

/** The memory table's address column: `0x` + uppercase hex without padding, or decimal. */
export function formatAddress(address: number, hex: boolean): string {
  return hex ? '0x' + address.toString(16).toUpperCase() : String(address);
}
