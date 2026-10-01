import { FpuCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** FLD1, FLDL2E, FLDL2T, FLDLG2, FLDLN2, FLDPI, FLDZ: push a constant. */
export class Fldxx extends FpuCommand {
  readonly mnemonics = ['FLD1', 'FLDL2E', 'FLDL2T', 'FLDLG2', 'FLDLN2', 'FLDPI', 'FLDZ'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    switch (p.mnemo) {
      case 'FLD1':
        this.fpu.push(1);
        break;
      case 'FLDL2E': // base-2 log of e
        this.fpu.push(Math.log(Math.E) / Math.log(2));
        break;
      case 'FLDL2T': // base-2 log of 10
        this.fpu.push(Math.log(10) / Math.log(2));
        break;
      case 'FLDLG2': // base-10 log of 2
        this.fpu.push(Math.log10(2));
        break;
      case 'FLDLN2': // base-e log of 2
        this.fpu.push(Math.log(2));
        break;
      case 'FLDPI':
        this.fpu.push(Math.PI);
        break;
      case 'FLDZ':
        this.fpu.push(0);
        break;
    }
  }
}
