import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/**
 * RET: pop 4 bytes into EIP. Popping above the top of memory raises the stack
 * error and leaves EIP and ESP unchanged (07 Q-S-1, via `Parameters.pop`).
 */
export class Ret extends Command {
  readonly mnemonics = ['RET'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    p.pop(this.dsp.EIP);
  }
}
