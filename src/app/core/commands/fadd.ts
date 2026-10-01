import { FpuDataType } from '../address';
import { FpuCommand } from '../command';
import { matches, Op } from '../op';
import { Parameters } from '../parameters';

/** Applies the arithmetic of FADD..FDIVR (and their P / FI variants) to `a` and `b`. */
export function fpuArithmetic(op: string, a: number, b: number): number {
  switch (op) {
    case 'ADD':
      return a + b;
    case 'SUB':
      return a - b;
    case 'SUBR':
      return b - a;
    case 'MUL':
      return a * b;
    case 'DIV':
      return a / b;
    case 'DIVR':
      return b / a;
    default:
      return a;
  }
}

/** FADD, FSUB, FSUBR, FMUL, FDIV, FDIVR. */
export class Fadd extends FpuCommand {
  readonly mnemonics = ['FADD', 'FSUB', 'FSUBR', 'FMUL', 'FDIV', 'FDIVR'];

  validate(p: Parameters) {
    const e = p.validate(0, Op.M32 | Op.M64 | Op.FPUREG | Op.FPUQUALI | Op.VARIABLE);
    if (e) return e;
    if (matches(p.type(0), Op.FPUREG)) {
      return (
        p.validate(1, Op.FPUREG | Op.NULL) ??
        (matches(p.type(1), Op.FPUREG) ? p.st0contained() : null) ??
        p.validate(2, Op.NULL)
      );
    }
    if (matches(p.type(0), Op.FPUQUALI)) {
      return p.validate(1, Op.FPUREG) ?? p.validate(2, Op.NULL);
    }
    return p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    p.normalizeParameters();
    p.fa = p.getF(0, FpuDataType.FLOAT);
    p.fb = p.getF(1, FpuDataType.FLOAT);
    p.fa = fpuArithmetic(p.mnemo.substring(1), p.fa, p.fb);
    p.putF(0, p.fa, FpuDataType.FLOAT);
  }
}
