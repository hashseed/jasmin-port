import { Command } from '../command';
import { long, shl, shr } from '../java';
import { Op, matches } from '../op';
import { Parameters } from '../parameters';

/** RCL, RCR, ROL, ROR (spec 05 §4). */
export class Rcl extends Command {
  readonly mnemonics = ['RCL', 'ROR', 'ROL', 'RCR'];

  validate(p: Parameters) {
    const e = p.validate(0, Op.REG | Op.M8 | Op.M16 | Op.M32);
    if (e) return e;
    if (
      (matches(p.type(1), Op.R8) && p.argument(1).address !== this.dsp.CL) ||
      !matches(p.type(1), Op.R8 | Op.I8)
    ) {
      return p.error(1, 'second register must be CL or an 8-bit immediate');
    }
    return p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    if ((p.b = p.get(1)) === 0n) return;
    let buffer = 0n;
    const bitsize = p.sizeOf(0) * 8;
    let buffersize = bitsize;
    const mask = 0xffffffffn >> BigInt(32 - bitsize);
    const shortmask = BigInt(0x7fffffff >> (32 - bitsize));
    // Prepare the buffer: the operand (and CF) followed by a copy of the operand.
    if (p.mnemo.startsWith('RC')) {
      p.b = p.b % BigInt(bitsize + 1);
      buffersize += 1;
      buffer = long(
        (p.get(0) & mask) |
          shl(d.fCarry ? 1n : 0n, bitsize) |
          shl(p.get(0) & shortmask, bitsize + 1),
      );
    } else if (p.mnemo.startsWith('RO')) {
      p.b = p.b % BigInt(bitsize);
      buffer = long((p.get(0) & mask) | shl(p.get(0) & mask, bitsize));
    }
    // Rotate.
    if (p.mnemo.endsWith('R')) {
      p.result = mask & shr(buffer, p.b);
      if (p.b === 1n) {
        d.fOverflow = this.getBit(p.result, bitsize - 2) !== this.getBit(p.result, bitsize - 1);
      }
      d.fCarry = this.getBit(buffer, p.b - 1n);
    } else {
      const shift = BigInt(buffersize) - p.b;
      p.result = mask & shr(buffer, shift);
      d.fCarry = this.getBit(buffer, shift % BigInt(buffersize));
      if (p.b === 1n) d.fOverflow = d.fCarry !== this.getBit(p.result, bitsize - 1);
    }
    p.put(0, p.result, null);
  }
}
