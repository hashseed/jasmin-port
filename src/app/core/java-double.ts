/**
 * Formats a double like Java's `Double.toString` (spec 02 §9), as used by the FPU
 * table and the headless runner.
 *
 * Placeholder for M0: exact for integral values below 1e7 and for NaN/Infinity.
 * The full algorithm (shortest repr, `E` notation outside [1e-3, 1e7)) lands in M1.
 */
export function formatJavaDouble(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (Object.is(value, -0)) return '-0.0';
  if (Number.isInteger(value) && Math.abs(value) < 1e7) return `${value}.0`;
  return String(value);
}
