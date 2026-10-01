import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** PUSH; the default operand size is 4 bytes (07 Q-I-13). */
export class Push extends Command {
  readonly mnemonics = ['PUSH'];

  validate(p: Parameters) {
    return (
      p.validate(0, Op.REG | Op.MEM | Op.IMM | Op.LABEL | Op.VARIABLE | Op.CONST) ??
      p.validateAllSizes(2, 4) ??
      p.validate(1, Op.NULL)
    );
  }

  execute(p: Parameters): void {
    p.argument(0).address.size = p.size;
    p.push(p.argument(0).address);
  }
}
