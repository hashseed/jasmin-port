import { DataSpace } from './data-space';
import { parseLong } from './java';
import { Op, matches } from './op';

/** Minimum size of an immediate (spec 03 §4), `Parser.getOperandSize(long)`. */
export function immediateSize(value: bigint): number {
  if (value < 0n) {
    const m = -value - 1n;
    if ((m & 127n) === m) return 1;
    if ((m & 32767n) === m) return 2;
    if ((m & 2147483647n) === m) return 4;
    return 8;
  }
  if ((value & 0xffn) === value) return 1;
  if ((value & 0xffffn) === value) return 2;
  if ((value & 0xffffffffn) === value) return 4;
  return 8;
}

/** `Parser.roundToOpSize`. */
export function roundToOpSize(a: number): number {
  if (a === 0 || a === 1 || a === 2 || a === 4 || a === 8) return a;
  if (a === 3) return 4;
  if (a < 8) return 8;
  let n = a;
  while (n % 4 !== 0) n++;
  return n;
}

/** Size of an operand of any type, -1 if undecided (`Parser.getOperandSize(String, int)`). */
export function operandSize(operand: string, type: number, dsp: DataSpace): number {
  if (matches(type, Op.SIZEQUALI)) {
    return { BYTE: 1, WORD: 2, DWORD: 4, QWORD: 8 }[operand] ?? -1;
  }
  if (matches(type, Op.REG)) return dsp.getRegisterSize(operand);
  if (matches(type, Op.IMM)) return immediateSize(parseLong(operand));
  if (matches(type, Op.FPUREG)) return 8;
  if (type === Op.CHARS) return roundToOpSize(operand.replace(/'/g, '').length);
  if (type === Op.STRING) return 1;
  return -1;
}
