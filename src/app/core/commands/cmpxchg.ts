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
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
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

  /** `execute` on numbers (operands of at most 32 bits, so the difference is exact). */
  private executeNum(p: Parameters): void {
    const dest = p.getNum(0);
    const src = p.getNum(1);
    const accumulator = this.dsp.getMatchingRegister(this.dsp.EAX, p.size)!;
    const a = p.getAddressNum(accumulator);
    const result = a - dest;
    this.setFlagsNum(
      p.size,
      Flag.ZF | Flag.CF | Flag.PF | Flag.AF | Flag.SF | Flag.OF,
      a,
      -dest,
      result,
      dest,
    );
    if (result === 0) p.putNum(0, src, null);
    else p.putAddressNum(accumulator, dest, null);
  }
}
