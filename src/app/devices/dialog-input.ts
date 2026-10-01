import { hex2dec } from '../core/number-literals';

/** Shown for any invalid entry in a device dialog (spec 06). */
export const INVALID_VALUE_MESSAGE = 'The entered value was not valid!';

export const ADDRESS_PROMPT = {
  display: 'Please enter a new address for the display to use:',
  console: 'Please enter a new address for the console to use:',
} as const;

/** Java's `Integer.parseInt`: optional sign, decimal digits, 32-bit range; null otherwise. */
export function parseJavaInt(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= -(2 ** 31) && value <= 2 ** 31 - 1 ? value : null;
}

/** The address dialog's initial text: `0x` and the address in lowercase hex. */
export function formatDeviceAddress(address: number): string {
  return '0x' + address.toString(16);
}

/**
 * Parses an address dialog entry: any literal form (spec 03 §3) of an integer in
 * `[offset, offset + memorySize]`; null if invalid. Surrounding blanks are ignored.
 */
export function parseDeviceAddress(
  text: string,
  offset: number,
  memorySize: number,
): number | null {
  const value = parseJavaInt(hex2dec(text.trim().toUpperCase()));
  if (value === null || value < offset || value > offset + memorySize) return null;
  return value;
}

/** Parses an integer dialog entry in `[min, max]`; null if invalid. */
export function parseCount(
  text: string,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): number | null {
  const value = parseJavaInt(text.trim());
  return value !== null && value >= min && value <= max ? value : null;
}
