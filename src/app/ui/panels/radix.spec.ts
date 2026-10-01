import {
  formatAddress,
  formatHex,
  formatValue,
  parseLiteral,
  parseMemoryInput,
  parseValue,
} from './radix';

describe('register formats (spec 02 §7.1)', () => {
  it('formats 32-bit values in every radix', () => {
    expect(formatValue(0, 4, 'bin')).toBe('0');
    expect(formatValue(5, 4, 'bin')).toBe('101');
    expect(formatValue(0xffffffff, 4, 'bin')).toBe('1'.repeat(32));
    expect(formatValue(0xffffffff, 4, 'sdec')).toBe('-1');
    expect(formatValue(0x7fffffff, 4, 'sdec')).toBe('2147483647');
    expect(formatValue(0x80000000, 4, 'sdec')).toBe('-2147483648');
    expect(formatValue(0xffffffff, 4, 'dec')).toBe('4294967295');
    expect(formatValue(255, 4, 'hex')).toBe('0x000000FF');
    expect(formatValue(4096, 4, 'hex')).toBe('0x00001000');
  });

  it('formats bytes with their own sign and padding', () => {
    expect(formatValue(0xff, 1, 'sdec')).toBe('-1');
    expect(formatValue(0x7f, 1, 'sdec')).toBe('127');
    expect(formatValue(0xff, 1, 'dec')).toBe('255');
    expect(formatValue(0xa, 1, 'hex')).toBe('0x0A');
    expect(formatValue(0x80, 1, 'bin')).toBe('10000000');
    expect(formatValue(0x8000, 2, 'sdec')).toBe('-32768');
  });

  it('formats hex with padding to the size', () => {
    expect(formatHex(0, 1)).toBe('0x00');
    expect(formatHex(0xbeef, 2)).toBe('0xBEEF');
    expect(formatHex(0xfffffffe, 4)).toBe('0xFFFFFFFE');
  });
});

describe('register parsing (spec 02 §7.2)', () => {
  it('reads hex with or without 0x', () => {
    expect(parseValue('ff', 'hex')).toBe(255n);
    expect(parseValue('0xFF', 'hex')).toBe(255n);
    expect(parseValue('10', 'hex')).toBe(16n);
    expect(parseValue('1B', 'hex')).toBe(27n);
    expect(parseValue('10h', 'hex')).toBe(16n);
  });

  it('reads binary with or without a trailing b', () => {
    expect(parseValue('101', 'bin')).toBe(5n);
    expect(parseValue('101b', 'bin')).toBe(5n);
    expect(parseValue('0x10', 'bin')).toBe(16n);
    // Not binary digits: read as any other literal (decimal here).
    expect(parseValue('2', 'bin')).toBe(2n);
  });

  it('reads decimals and every literal form in the decimal modes', () => {
    expect(parseValue('-5', 'sdec')).toBe(-5n);
    expect(parseValue(' 42 ', 'dec')).toBe(42n);
    expect(parseValue('0x10', 'sdec')).toBe(16n);
    expect(parseValue('$1f', 'dec')).toBe(31n);
    expect(parseValue('17o', 'dec')).toBe(15n);
    expect(parseValue('11b', 'dec')).toBe(3n);
  });

  it('rejects invalid input', () => {
    expect(parseValue('', 'dec')).toBeNull();
    expect(parseValue('abc', 'dec')).toBeNull();
    expect(parseValue('12x', 'hex')).toBeNull();
    expect(parseValue('99999999999999999999', 'dec')).toBeNull();
    expect(parseLiteral('eax')).toBeNull();
  });
});

describe('memory cells (spec 02 §10.2)', () => {
  it('adds a missing 0x in the hex column only', () => {
    expect(parseMemoryInput('ff', 'hex')).toBe(255n);
    expect(parseMemoryInput('0x10', 'hex')).toBe(16n);
    expect(parseMemoryInput('10h', 'hex')).toBe(16n);
    expect(parseMemoryInput('10', 'hex')).toBe(16n);
    expect(parseMemoryInput('10', 'signed')).toBe(10n);
    expect(parseMemoryInput('-2', 'signed')).toBe(-2n);
    expect(parseMemoryInput('ff', 'unsigned')).toBeNull();
  });

  it('formats addresses as unpadded hex or decimal', () => {
    expect(formatAddress(0, true)).toBe('0x0');
    expect(formatAddress(0x1c, true)).toBe('0x1C');
    expect(formatAddress(4096, false)).toBe('4096');
  });
});
