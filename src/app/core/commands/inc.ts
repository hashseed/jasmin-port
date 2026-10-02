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
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
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

  /** `execute` on numbers (exact: the operand has at most 32 bits). */
  private executeNum(p: Parameters): void {
    const a = p.getNum(0);
    const flags = Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.PF;
    let result: number;
    switch (p.mnemo) {
      case 'INC':
        result = a + 1;
        this.setFlagsNum(p.size, flags, a, 1, result, 1);
        break;
      case 'DEC':
        result = a - 1;
        this.setFlagsNum(p.size, flags, a, -1, result, 1);
        break;
      case 'NEG':
        // 0 + (-a), with the subtrahend a for AF.
        result = -a;
        this.setFlagsNum(p.size, flags, 0, -a, result, a);
        this.dsp.fCarry = result !== 0;
        break;
      default: // NOT
        result = ~a;
        break;
    }
    p.putNum(0, result, null);
  }
}
