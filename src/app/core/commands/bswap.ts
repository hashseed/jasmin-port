import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** BSWAP r32. */
export class Bswap extends Command {
  readonly mnemonics = ['BSWAP'];

  validate(p: Parameters) {
    return p.validate(0, Op.R32) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    const source = p.get(0);
    const dest =
      ((source & 0xffn) << 24n) |
      ((source & 0xff00n) << 8n) |
      ((source & 0xff0000n) >> 8n) |
      ((source & 0xff000000n) >> 24n);
    p.put(0, dest, null);
  }
}
