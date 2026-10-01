import { FpuDataType } from '../address';
import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';
import { fpuArithmetic } from './fadd';

/** FIADD, FISUB, FISUBR, FIMUL, FIDIV, FIDIVR: ST0 op integer memory operand. */
export class Fiadd extends FpuCommand {
  readonly mnemonics = ['FIADD', 'FISUB', 'FISUBR', 'FIMUL', 'FIDIV', 'FIDIVR'];

  validate(p: Parameters) {
    return p.validate(0, Op.M16 | Op.M32) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    p.normalizeParameters();
    p.fa = p.getF(0, FpuDataType.INTEGER);
    p.fb = p.getF(1, FpuDataType.INTEGER);
    // 'FIDIVR' -> 'DIVR'
    p.fa = fpuArithmetic(p.mnemo.substring(2), p.fa, p.fb);
    this.fpu.put(0, p.fa);
  }
}
