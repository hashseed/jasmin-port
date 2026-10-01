import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** FABS, FCHS: absolute value / sign change of ST0. */
export class Fabs extends FpuCommand {
  readonly mnemonics = ['FABS', 'FCHS'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    switch (p.mnemo) {
      case 'FABS':
        this.fpu.put(0, Math.abs(this.fpu.get(0)));
        break;
      case 'FCHS':
        this.fpu.put(0, -this.fpu.get(0));
        break;
    }
  }
}
