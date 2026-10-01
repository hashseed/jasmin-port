import { FpuDataType } from '../address';
import { FpuCommand } from '../command';
import { ParseError } from '../parse-error';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** FILD, FIST, FISTP: integer load and store. */
export class Fild extends FpuCommand {
  readonly mnemonics = ['FILD', 'FIST', 'FISTP'];

  validate(p: Parameters) {
    let e: ParseError | null = null;
    if (p.mnemo === 'FILD' || p.mnemo === 'FISTP') {
      e = p.validate(0, Op.M16 | Op.M32 | Op.M64);
    } else if (p.mnemo === 'FIST') {
      // As in the original: has no effect, the operation size is already fixed.
      p.defaultSize = 4;
      e = p.validate(0, Op.M16 | Op.M32);
    }
    return e ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.mnemo === 'FILD') {
      this.fpu.push(p.getF(0, FpuDataType.INTEGER));
      return;
    }
    let d = 0;
    if (p.mnemo === 'FIST') d = this.fpu.get(0);
    if (p.mnemo === 'FISTP') d = this.fpu.pop();
    p.putF(0, d, FpuDataType.INTEGER);
  }
}
