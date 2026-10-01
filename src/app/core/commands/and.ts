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
}
