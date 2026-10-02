import { Command, Flag } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** AND, OR, XOR, TEST. */
export class And extends Command {
  readonly mnemonics = ['AND', 'OR', 'XOR', 'TEST'];

  validate(p: Parameters) {
    return p.numericDestOK() ?? p.numericSrcOK() ?? p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    p.prepareAB();
    switch (p.mnemo) {
      case 'AND':
      case 'TEST':
        p.result = p.a & p.b;
        break;
      case 'OR':
        p.result = p.a | p.b;
        break;
      case 'XOR':
        p.result = p.a ^ p.b;
        break;
    }
    this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
    this.dsp.fOverflow = false;
    this.dsp.fCarry = false;
    if (p.mnemo !== 'TEST') p.put(0, p.result, null);
  }

  /** `execute` on numbers: SF, ZF, PF and the stored bits depend on the low 32 bits only. */
  private executeNum(p: Parameters): void {
    const a = p.getNum(0);
    const b = p.getNum(1);
    let result: number;
    switch (p.mnemo) {
      case 'OR':
        result = a | b;
        break;
      case 'XOR':
        result = a ^ b;
        break;
      default: // AND, TEST
        result = a & b;
        break;
    }
    this.setFlagsNum(p.size, Flag.SF | Flag.ZF | Flag.PF, a, b, result, b);
    this.dsp.fOverflow = false;
    this.dsp.fCarry = false;
    if (p.mnemo !== 'TEST') p.putNum(0, result, null);
  }
}
