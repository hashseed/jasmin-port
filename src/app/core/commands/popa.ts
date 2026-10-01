import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/**
 * POPA: pop DI, SI, BP, (SP into BX, then overwritten), BX, DX, CX, AX. Each pop is
 * bounded by the top of memory (07 Q-S-1).
 */
export class PopA extends Command {
  readonly mnemonics = ['POPA'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    p.pop(d.DI);
    p.pop(d.SI);
    p.pop(d.BP);
    p.pop(d.BX); // overwritten by the next pop
    p.pop(d.BX);
    p.pop(d.DX);
    p.pop(d.CX);
    p.pop(d.AX);
  }
}
