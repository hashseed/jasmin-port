import { Command } from '../command';
import { Parameters } from '../parameters';

/** POP; the default operand size is 4 bytes (07 Q-I-13). */
export class Pop extends Command {
  readonly mnemonics = ['POP'];

  validate(p: Parameters) {
    return p.numericDestOK() ?? p.validateAllSizes(2, 4);
  }

  execute(p: Parameters): void {
    p.pop(p.addressOf(0));
  }
}
