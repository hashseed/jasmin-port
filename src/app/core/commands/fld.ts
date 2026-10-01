import { FpuDataType } from '../address';
import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** FLD, FST, FSTP: floating-point load and store. */
export class Fld extends FpuCommand {
  readonly mnemonics = ['FLD', 'FST', 'FSTP'];

  validate(p: Parameters) {
    return p.validate(0, Op.M32 | Op.M64 | Op.FPUREG) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.mnemo === 'FLD') {
      this.fpu.push(p.getF(0, FpuDataType.FLOAT));
      return;
    }
    p.putF(0, this.fpu.get(0), FpuDataType.FLOAT);
    if (p.mnemo === 'FSTP') this.fpu.pop();
  }
}
