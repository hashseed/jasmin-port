import { Command, Flag } from '../command';
import { long } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** INC, DEC, NEG, NOT. */
export class Inc extends Command {
  readonly mnemonics = ['INC', 'DEC', 'NEG', 'NOT'];

  validate(p: Parameters) {
    return p.validate(0, Op.REG | Op.M8 | Op.M16 | Op.M32) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    p.a = p.get(0);
    let subtrahend: bigint | undefined;
    switch (p.mnemo) {
      case 'INC':
        p.b = 1n;
        p.result = long(p.a + p.b);
        break;
      case 'DEC':
        p.b = -1n;
        subtrahend = 1n;
        p.result = long(p.a + p.b);
        break;
      case 'NEG':
        subtrahend = p.a;
        p.b = long(-p.a);
        p.a = 0n;
        p.result = long(p.a + p.b);
        break;
      case 'NOT':
        p.result = ~p.a;
        break;
    }
    if (p.mnemo !== 'NOT') {
      this.setFlags(p, Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.PF, subtrahend);
    }
    if (p.mnemo === 'NEG') this.dsp.fCarry = p.result !== 0n;
    p.put(0, p.result, null);
  }
}
