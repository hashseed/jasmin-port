import { Command, Condition, conditionCode } from '../command';
import { int } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** LOOP, LOOPE/LOOPZ, LOOPNE/LOOPNZ: always decrement ECX (07 Q-I-14). */
export class Loop extends Command {
  readonly mnemonics = ['LOOP', 'LOOPE', 'LOOPNE', 'LOOPNZ', 'LOOPZ'];

  validate(p: Parameters) {
    return p.validate(0, Op.LABEL | Op.MEM | Op.REG | Op.IMM | Op.CONST) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    const target = p.numeric ? p.getNum(0) | 0 : Number(int(p.get(0)));
    // Java long arithmetic: ECX = 0 gives -1 here (stored as 0xFFFFFFFF), which jumps.
    const ecx = this.dsp.registers.get(this.dsp.ECX) - 1;
    p.putAddressNum(this.dsp.ECX, ecx, null);
    if (p.condition < 0) {
      p.condition = p.mnemo === 'LOOP' ? Condition.ALWAYS : conditionCode(p.mnemo.substring(4));
    }
    if (ecx !== 0 && this.testCondition(p.condition)) this.dsp.setInstructionPointer(target);
  }
}
