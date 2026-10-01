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
}
