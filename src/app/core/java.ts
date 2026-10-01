/**
 * Helpers that reproduce Java's primitive semantics. Values that are `long` in
 * the original are `bigint` here and are wrapped to 64 bits with `long()`.
 */

export const long = (value: bigint): bigint => BigInt.asIntN(64, value);
export const int = (value: bigint): bigint => BigInt.asIntN(32, value);
export const short = (value: bigint): bigint => BigInt.asIntN(16, value);
export const byte = (value: bigint): bigint => BigInt.asIntN(8, value);

/** Java `(int)` of a number: wraps to a signed 32-bit integer. */
export const toInt32 = (value: number): number => value | 0;

/** Java `x >> n` for longs (arithmetic, shift count masked to 6 bits). */
export const shr = (value: bigint, count: bigint | number): bigint =>
  long(value) >> (BigInt(count) & 63n);
/** Java `x >>> n` for longs. */
export const ushr = (value: bigint, count: bigint | number): bigint =>
  long(BigInt.asUintN(64, value) >> (BigInt(count) & 63n));
/** Java `x << n` for longs. */
export const shl = (value: bigint, count: bigint | number): bigint =>
  long(value << (BigInt(count) & 63n));

/** Mask with the low `size * 8` bits set, as `((long) 1 << (size * 8)) - 1`. */
export const sizeMask = (size: number): bigint => long(shl(1n, size * 8) - 1n);

const LONG_MIN = -(2n ** 63n);
const LONG_MAX = 2n ** 63n - 1n;

/**
 * Java `Long.parseLong(s, radix)`: an optional sign followed by digits of the radix.
 * Throws on anything else or on overflow, like NumberFormatException.
 */
export function parseLong(text: string, radix = 10): bigint {
  const match = /^([+-]?)([0-9A-Za-z]+)$/.exec(text);
  if (!match) throw new NumberFormatError(text);
  let value = 0n;
  const big = BigInt(radix);
  for (const ch of match[2]) {
    const digit = parseInt(ch, 36);
    if (Number.isNaN(digit) || digit >= radix) throw new NumberFormatError(text);
    value = value * big + BigInt(digit);
  }
  if (match[1] === '-') value = -value;
  if (value < LONG_MIN || value > LONG_MAX) throw new NumberFormatError(text);
  return value;
}

/** Java `Integer.valueOf(s)` on a decimal string; throws on overflow. */
export function parseInt32(text: string): number {
  const value = parseLong(text);
  if (value < -(2n ** 31n) || value > 2n ** 31n - 1n) throw new NumberFormatError(text);
  return Number(value);
}

export class NumberFormatError extends Error {
  constructor(input: string) {
    super(`For input string: "${input}"`);
  }
}

const scratch = new DataView(new ArrayBuffer(8));

/** `Double.doubleToRawLongBits`. */
export function doubleToLongBits(value: number): bigint {
  scratch.setFloat64(0, value);
  return scratch.getBigInt64(0);
}

/** `Double.longBitsToDouble`. */
export function longBitsToDouble(bits: bigint): number {
  scratch.setBigInt64(0, long(bits));
  return scratch.getFloat64(0);
}

/** `Float.floatToRawIntBits`, sign-extended to a long like Java's int-to-long widening. */
export function floatToIntBits(value: number): bigint {
  scratch.setFloat32(0, value);
  return BigInt(scratch.getInt32(0));
}

/** `Float.intBitsToFloat` of the low 32 bits. */
export function intBitsToFloat(bits: bigint): number {
  scratch.setInt32(0, Number(int(bits)));
  return scratch.getFloat32(0);
}

/**
 * `Double.parseDouble` for the literal forms the parser accepts
 * (`-?[0-9]+\.[0-9]*(E[+-]?[0-9]+)?` and plain integers). Returns NaN for others.
 */
export function parseJavaDouble(text: string): number {
  const trimmed = text.trim();
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(trimmed)) {
    if (/^[+-]?(NaN|Infinity)$/.test(trimmed)) return Number(trimmed);
    return NaN;
  }
  return Number(trimmed.replace(/[dDfF]$/, ''));
}

/** Java `(long) d`: truncates toward zero, saturates, NaN -> 0. */
export function doubleToLong(value: number): bigint {
  if (Number.isNaN(value)) return 0n;
  if (value >= 2 ** 63) return LONG_MAX;
  if (value <= -(2 ** 63)) return LONG_MIN;
  return BigInt(Math.trunc(value));
}
