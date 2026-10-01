import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** STD, CLD, STC, CLC, CMC. */
export class Std extends Command {
  readonly mnemonics = ['STD', 'CLD', 'STC', 'CLC', 'CMC'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    switch (p.mnemo) {
      case 'STD':
        d.fDirection = true;
        break;
      case 'CLD':
        d.fDirection = false;
        break;
      case 'STC':
        d.fCarry = true;
        break;
      case 'CLC':
        d.fCarry = false;
        break;
      case 'CMC':
        d.fCarry = !d.fCarry;
        break;
    }
  }
}
