import { Command } from '../command';
import { int } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** LOOP, LOOPE/LOOPZ, LOOPNE/LOOPNZ: always decrement ECX (07 Q-I-14). */
export class Loop extends Command {
  readonly mnemonics = ['LOOP', 'LOOPE', 'LOOPNE', 'LOOPNZ', 'LOOPZ'];

  validate(p: Parameters) {
    return p.validate(0, Op.LABEL | Op.MEM | Op.REG | Op.IMM | Op.CONST) ?? p.validate(1, Op.NULL);
  }

  private testCondition(mnemo: string): boolean {
    return mnemo === 'LOOP' || this.testCC(mnemo.substring(4));
  }

  execute(p: Parameters): void {
    p.a = p.get(0);
    // Java long arithmetic: ECX = 0 gives -1 here (stored as 0xFFFFFFFF), which jumps.
    const ecx = this.dsp.shortcut(this.dsp.ECX) - 1n;
    p.putAddress(this.dsp.ECX, ecx, null);
    if (ecx !== 0n && this.testCondition(p.mnemo)) {
      this.dsp.setInstructionPointer(Number(int(p.a)));
    }
  }
}
