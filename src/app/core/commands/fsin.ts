import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** FSIN, FCOS, FSINCOS, FSQRT on ST0. */
export class Fsin extends FpuCommand {
  readonly mnemonics = ['FSIN', 'FCOS', 'FSINCOS', 'FSQRT'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const fpu = this.fpu;
    switch (p.mnemo) {
      case 'FSIN':
        fpu.put(0, Math.sin(fpu.get(0)));
        break;
      case 'FCOS':
        fpu.put(0, Math.cos(fpu.get(0)));
        break;
      case 'FSINCOS': {
        const a = fpu.get(0);
        fpu.put(0, Math.sin(a));
        fpu.push(Math.cos(a));
        break;
      }
      case 'FSQRT':
        fpu.put(0, Math.sqrt(fpu.get(0)));
        break;
    }
  }
}
