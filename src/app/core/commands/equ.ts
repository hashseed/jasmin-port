import { PreprocCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** EQU: defines a constant at parse time. */
export class Equ extends PreprocCommand {
  readonly mnemonics = ['EQU'];

  validate(p: Parameters) {
    const e = p.validate(0, Op.IMM) ?? p.validate(1, Op.NULL);
    if (e) return e;
    this.execute(p);
    return null;
  }

  execute(p: Parameters): void {
    if (p.label !== null) this.dsp.setConstantValue(p.label, p.get(0));
  }
}
