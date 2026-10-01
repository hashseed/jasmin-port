/**
 * Formats a double like Java's `Double.toString` (JDK 19+, shortest round-trip
 * digits), as used by the FPU table and the headless runner (spec 02 §9).
 */
export function formatJavaDouble(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Infinity) return 'Infinity';
  if (value === -Infinity) return '-Infinity';
  if (value === 0) return Object.is(value, -0) ? '-0.0' : '0.0';

  const sign = value < 0 ? '-' : '';
  // Shortest digits and decimal exponent from JS, which also produces the
  // shortest round-trip representation.
  const [mantissa, exp] = Math.abs(value).toExponential().split('e');
  const digits = mantissa.replace('.', '');
  const exponent = Number(exp);
  const abs = Math.abs(value);

  if (abs >= 1e-3 && abs < 1e7) {
    // Plain decimal notation with at least one digit after the point.
    const pointPos = exponent + 1;
    let text: string;
    if (pointPos <= 0) {
      text = '0.' + '0'.repeat(-pointPos) + digits;
    } else if (pointPos >= digits.length) {
      text = digits + '0'.repeat(pointPos - digits.length) + '.0';
    } else {
      text = digits.slice(0, pointPos) + '.' + digits.slice(pointPos);
    }
    return sign + text;
  }
  // Computerized scientific notation: d.ddddE±n, at least one fractional digit.
  const fraction = digits.length > 1 ? digits.slice(1) : '0';
  return `${sign}${digits[0]}.${fraction}E${exponent}`;
}
