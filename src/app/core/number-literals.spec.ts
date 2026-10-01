import { describe, expect, it } from 'vitest';
import { hex2dec } from './number-literals';

describe('hex2dec', () => {
  it.each([
    ['42', '42'],
    ['-7', '-7'],
    ['0X1F', '31'],
    ['0FFH', '255'],
    ['10H', '16'],
    ['$1F', '31'],
    ['1010B', '10'],
    ['17O', '15'],
    ['777Q', '511'],
    ['-0X10', '-16'],
    ['[EBX+0X10]', '[EBX+16]'],
    ['[ESI*4+10H]', '[ESI*4+16]'],
    ['FFH', 'FFH'],
    ['ABC', 'ABC'],
    ['1.5', '1.5'],
  ])('%s -> %s', (input, output) => {
    expect(hex2dec(input)).toBe(output);
  });

  it('leaves literals that overflow a long unconverted', () => {
    expect(hex2dec('0XFFFFFFFFFFFFFFFF')).toBe('0XFFFFFFFFFFFFFFFF');
    expect(hex2dec('0X7FFFFFFFFFFFFFFF')).toBe('9223372036854775807');
  });
});
