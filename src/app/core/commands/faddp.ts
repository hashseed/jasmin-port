import { FpuDataType } from '../address';
import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';
import { fpuArithmetic } from './fadd';

/** FADDP, FSUBP, FSUBRP, FMULP, FDIVP, FDIVRP: operate, then pop. */
export class Faddp extends FpuCommand {
  readonly mnemonics = ['FADDP', 'FSUBP', 'FSUBRP', 'FMULP', 'FDIVP', 'FDIVRP'];

  validate(p: Parameters) {
    return p.validate(0, Op.FPUREG | Op.NULL) ?? p.validate(1, Op.FPUST0 | Op.NULL);
  }

  execute(p: Parameters): void {
    p.normalizePopParameters();
    p.fa = p.getF(0, FpuDataType.FLOAT);
    p.fb = p.getF(1, FpuDataType.FLOAT);
    // 'FSUBRP' -> 'SUBR'
    p.fa = fpuArithmetic(p.mnemo.substring(1, p.mnemo.length - 1), p.fa, p.fb);
    p.putF(0, p.fa, FpuDataType.FLOAT);
    this.fpu.pop();
  }
}
