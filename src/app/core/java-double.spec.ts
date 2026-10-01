import { describe, expect, it } from 'vitest';
import { formatJavaDouble } from './java-double';

describe('formatJavaDouble', () => {
  it.each([
    [0, '0.0'],
    [-0, '-0.0'],
    [1, '1.0'],
    [1.5, '1.5'],
    [-2.25, '-2.25'],
    [Math.PI, '3.141592653589793'],
    [1e10, '1.0E10'],
    [1e7, '1.0E7'],
    [9999999, '9999999.0'],
    [0.001, '0.001'],
    [0.0001, '1.0E-4'],
    [1.2345e-7, '1.2345E-7'],
    [123456789.5, '1.234567895E8'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
  ])('%d -> %s', (value, text) => {
    expect(formatJavaDouble(value)).toBe(text);
  });
});
