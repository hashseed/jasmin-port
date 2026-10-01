import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

const CMOV = [
  'CMOVA',
  'CMOVAE',
  'CMOVB',
  'CMOVBE',
  'CMOVC',
  'CMOVE',
  'CMOVG',
  'CMOVGE',
  'CMOVL',
  'CMOVLE',
  'CMOVNA',
  'CMOVNAE',
  'CMOVNB',
  'CMOVNBE',
  'CMOVNC',
  'CMOVNE',
  'CMOVNG',
  'CMOVNGE',
  'CMOVNL',
  'CMOVNLE',
  'CMOVNO',
  'CMOVNP',
  'CMOVNS',
  'CMOVNZ',
  'CMOVO',
  'CMOVP',
  'CMOVPE',
  'CMOVPO',
  'CMOVS',
  'CMOVZ',
];

/** MOV and CMOVcc (spec 05). */
export class Mov extends Command {
  readonly mnemonics = ['MOV', ...CMOV];

  validate(p: Parameters) {
    if (p.mnemo !== 'MOV') {
      // CMOVcc takes x86 operands only (07 Q-I-16).
      return (
        p.validate(0, Op.R16 | Op.R32) ??
        // Undecided memory takes the destination's size.
        (p.type(1) === Op.MU ? null : p.validate(1, Op.R16 | Op.R32 | Op.M16 | Op.M32)) ??
        p.consistentSizes() ??
        p.validate(2, Op.NULL)
      );
    }
    // A third operand is an error (07 Q-P-3).
    return p.numericDestOK() ?? p.numericSrcOK() ?? p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.mnemo !== 'MOV' && !this.testCC(p.mnemo.substring(4))) return;
    if (p.type(1) === Op.LABEL) {
      const a = p.argument(1);
      p.put(0, p.get(1), { type: a.address.type, value: a.arg, size: a.address.size });
    } else {
      p.put(0, p.get(1), null);
    }
  }
}
