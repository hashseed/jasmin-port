import { Command, Flag } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** BCD adjust: AAA, AAS, AAD, AAM, DAA, DAS (spec 05 §9). */
export class Aaa extends Command {
  readonly mnemonics = ['AAA', 'AAS', 'AAD', 'AAM', 'DAA', 'DAS'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  /** SF, ZF and PF from AL (07 Q-I-10; the original changed no flags). */
  private setFlagsFromAL(p: Parameters): void {
    const size = p.size;
    p.size = 1;
    this.setFlags(p, Flag.PF | Flag.SF | Flag.ZF);
    p.size = size;
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    let al = p.getAddress(d.AL);
    switch (p.mnemo) {
      case 'AAA':
        al = 0xfn & al;
        d.fCarry = d.fAuxiliary = al > 9n || d.fAuxiliary;
        if (d.fCarry) {
          p.putAddress(d.AL, 0xfn & (al + 6n), null);
          p.putAddress(d.AH, p.getAddress(d.AH) + 1n, null);
        } else {
          p.putAddress(d.AL, al, null);
        }
        break;
      case 'AAS':
        al = 0xfn & al;
        d.fCarry = d.fAuxiliary = al > 9n || d.fAuxiliary;
        if (d.fCarry) {
          p.putAddress(d.AL, 0xfn & (al - 6n), null);
          p.putAddress(d.AH, p.getAddress(d.AH) - 1n, null);
        } else {
          p.putAddress(d.AL, al, null);
        }
        break;
      case 'DAA': {
        const oldCarry = d.fCarry;
        d.fAuxiliary = d.fAuxiliary || (al & 0xfn) > 9n;
        if (d.fAuxiliary) {
          p.putAddress(d.AL, al + 6n, null);
          d.fCarry ||= (((al + 6n) >> 8n) & 1n) === 1n;
        }
        d.fCarry = al > 0x99n || oldCarry;
        if (d.fCarry) p.putAddress(d.AL, p.getAddress(d.AL) + 0x60n, null);
        break;
      }
      case 'DAS': {
        const oldCarry = d.fCarry;
        d.fAuxiliary = d.fAuxiliary || (al & 0xfn) > 9n;
        if (d.fAuxiliary) {
          p.putAddress(d.AL, al - 6n, null);
          d.fCarry ||= (((al - 6n) >> 8n) & 1n) === 1n;
        }
        d.fCarry = al > 0x99n || oldCarry;
        if (d.fCarry) p.putAddress(d.AL, p.getAddress(d.AL) - 0x60n, null);
        break;
      }
      case 'AAM':
        p.putAddress(d.AH, al / 10n, null);
        p.putAddress(d.AL, (p.result = al % 10n), null);
        this.setFlagsFromAL(p);
        break;
      default: // AAD
        p.result = p.getAddress(d.AL) + 10n * p.getAddress(d.AH);
        p.putAddress(d.AL, p.result, null);
        p.putAddress(d.AH, 0n, null);
        this.setFlagsFromAL(p);
        break;
    }
  }
}
