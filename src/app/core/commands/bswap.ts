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
    // A 32-bit register: numbers suffice.
    const source = p.getNum(0);
    const dest =
      ((source & 0xff) << 24) |
      ((source & 0xff00) << 8) |
      ((source >>> 8) & 0xff00) |
      (source >>> 24);
    p.putNum(0, dest, null);
  }
}
