import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** POPAD: 32-bit POPA, each pop bounded by the top of memory (07 Q-S-1). */
export class PopAD extends Command {
  readonly mnemonics = ['POPAD'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    p.pop(d.EDI);
    p.pop(d.ESI);
    p.pop(d.EBP);
    p.pop(d.EBX); // overwritten by the next pop
    p.pop(d.EBX);
    p.pop(d.EDX);
    p.pop(d.ECX);
    p.pop(d.EAX);
  }
}
