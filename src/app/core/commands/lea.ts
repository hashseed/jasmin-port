import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** LEA r, m: loads the effective address without accessing memory. */
export class Lea extends Command {
  readonly mnemonics = ['LEA'];

  validate(p: Parameters) {
    return p.validate(0, Op.REG) ?? p.validate(1, Op.MEM) ?? p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    const address = p.argument(1).cAddress?.calculateEffectiveAddress(true) ?? 0;
    p.put(0, BigInt(address), null);
  }
}
