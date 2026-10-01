import { Command, Flag } from '../command';
import { long } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** CMPXCHG dest, src: compare the accumulator with dest, then exchange. */
export class Cmpxchg extends Command {
  readonly mnemonics = ['CMPXCHG'];

  validate(p: Parameters) {
    return p.firstRegMemSecondReg() ?? p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    p.prepareAB();
    p.c = p.b;
    const dest = p.a;
    const accumulator = this.dsp.getMatchingRegister(this.dsp.EAX, p.size)!;
    p.a = p.getAddress(accumulator);
    // Compare: flags of acc - dest; AF from the original operands (07 Q-F-1).
    p.b = long(-dest);
    p.result = long(p.a + p.b);
    this.setFlags(p, Flag.ZF | Flag.CF | Flag.PF | Flag.AF | Flag.SF | Flag.OF, dest);
    // Exchange; when not equal the accumulator receives the destination (07 Q-I-4).
    if (p.result === 0n) p.put(0, p.c, null);
    else p.putAddress(accumulator, dest, null);
  }
}
