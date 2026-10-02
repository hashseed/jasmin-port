import { Command, Flag } from '../command';
import { long } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** ADD, ADC, SUB, SBB, CMP. */
export class Add extends Command {
  readonly mnemonics = ['ADD', 'ADC', 'SUB', 'SBB', 'CMP'];

  validate(p: Parameters) {
    return p.numericDestOK() ?? p.numericSrcOK() ?? p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    p.prepareAB();
    const carry = this.dsp.fCarry ? 1n : 0n;
    let subtrahend: bigint | undefined;
    switch (p.mnemo) {
      case 'ADD':
        p.result = long(p.a + p.b);
        break;
      case 'ADC':
        p.result = long(p.a + p.b + carry);
        break;
      case 'SUB':
      case 'CMP':
        // setFlags() expects the negated subtrahend in b; AF uses the original (07 Q-F-1).
        subtrahend = p.b;
        p.b = long(-p.b);
        p.result = long(p.a + p.b);
        break;
      case 'SBB':
        subtrahend = p.b;
        p.b = long(-p.b);
        p.result = long(p.a + p.b - carry);
        break;
    }
    this.setFlags(p, Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.CF | Flag.PF, subtrahend);
    if (p.mnemo !== 'CMP') p.put(0, p.result, null);
  }

  /**
   * `execute` on numbers. The operands are 32-bit values or small immediates, so
   * the sums are exact and equal the Java long results (no 64-bit wraparound).
   */
  private executeNum(p: Parameters): void {
    const a = p.getNum(0);
    const b = p.getNum(1);
    const carry = this.dsp.fCarry ? 1 : 0;
    let result: number;
    switch (p.mnemo) {
      case 'ADD':
        result = a + b;
        break;
      case 'ADC':
        result = a + b + carry;
        break;
      case 'SBB':
        result = a - b - carry;
        break;
      default: // SUB, CMP
        result = a - b;
        break;
    }
    const flags = Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.CF | Flag.PF;
    if (p.mnemo === 'ADD' || p.mnemo === 'ADC') this.setFlagsNum(p.size, flags, a, b, result, b);
    // setFlags() expects the negated subtrahend in b; AF uses the original (07 Q-F-1).
    else this.setFlagsNum(p.size, flags, a, -b, result, b);
    if (p.mnemo !== 'CMP') p.putNum(0, result, null);
  }
}
