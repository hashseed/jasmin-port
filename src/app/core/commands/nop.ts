import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

export class Nop extends Command {
  readonly mnemonics = ['NOP', 'FNOP'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(): void {
    // Nothing to do.
  }
}
