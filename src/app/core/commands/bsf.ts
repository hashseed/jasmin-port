import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** BSF, BSR: bit scan forward / reverse. */
export class Bsf extends Command {
  readonly mnemonics = ['BSF', 'BSR'];

  validate(p: Parameters) {
    return (
      p.consistentSizes() ??
      p.validate(0, Op.R16 | Op.R32) ??
      p.validate(1, Op.R16 | Op.R32 | Op.M16 | Op.M32 | Op.MU) ??
      p.validate(2, Op.NULL)
    );
  }

  execute(p: Parameters): void {
    const word = p.get(1);
    this.dsp.fZero = word === 0n;
    if (this.dsp.fZero) return;
    const bits = p.size * 8;
    if (p.mnemo.endsWith('F')) {
      for (let i = 0; i < bits; i++) {
        if (this.getBit(word, i)) {
          p.put(0, BigInt(i), null);
          return;
        }
      }
    } else if (p.mnemo.endsWith('R')) {
      for (let i = bits - 1; i >= 0; i--) {
        if (this.getBit(word, i)) {
          p.put(0, BigInt(i), null);
          return;
        }
      }
    }
  }
}
