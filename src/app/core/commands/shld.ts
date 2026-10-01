import { Command, Flag } from '../command';
import { int, long, shl, shr } from '../java';
import { Op, matches } from '../op';
import { Parameters } from '../parameters';

const HIGH_DWORD = long(0xffffffff00000000n);

/** SHLD, SHRD: double-precision shifts (spec 05 §4). */
export class Shld extends Command {
  readonly mnemonics = ['SHLD', 'SHRD'];

  validate(p: Parameters) {
    const e =
      p.validate(0, Op.M16 | Op.M32 | Op.R16 | Op.R32 | Op.MU) ?? p.validate(1, Op.R16 | Op.R32);
    if (e) return e;
    if (
      (matches(p.type(2), Op.R8) && p.argument(2).address !== this.dsp.CL) ||
      !matches(p.type(2), Op.R8 | Op.I8)
    ) {
      return p.error(2, 'third register must be CL or an 8-bit immediate');
    }
    return (p.sizeOf(0) & p.sizeOf(1)) !== 0 ? null : p.error(1, 'Size mismatch');
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    p.b = p.get(2);
    if (p.b === 0n || p.b >= BigInt(p.sizeOf(0) * 8)) return;
    p.a = p.get(0);
    const size = p.sizeOf(0);
    if (p.mnemo === 'SHLD') {
      if (size === 2) {
        const buffer = int(((p.a & 0xffffn) << 16n) | (p.get(1) & 0xffffn));
        p.result = (int(shl(buffer, p.b & 31n)) & 0xffff0000n) >> 16n;
        d.fCarry = this.getBit(buffer, 32n - p.b);
        this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
        d.fOverflow = p.b === 1n && this.getBit(p.a, 15) !== this.getBit(p.result, 15);
      } else if (size === 4) {
        const buffer = long(((p.a & 0xffffffffn) << 32n) | (p.get(1) & 0xffffffffn));
        p.result = shr(shl(buffer, p.b) & HIGH_DWORD, 32);
        d.fCarry = this.getBit(buffer, 64n - p.b);
        this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
        d.fOverflow = p.b === 1n && this.getBit(p.a, 31) !== this.getBit(p.result, 31);
      }
    }
    if (p.mnemo === 'SHRD') {
      if (size === 2) {
        const buffer = int((p.a & 0xffffn) | ((p.get(1) & 0xffffn) << 16n));
        p.result = shr(buffer, p.b & 31n) & 0xffffn;
        d.fCarry = this.getBit(buffer, p.b - 1n);
        this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
        d.fOverflow = p.b === 1n && this.getBit(p.a, 15) !== this.getBit(p.result, 15);
      } else if (size === 4) {
        // src:dest shifted right, so the source fills from the left (07 Q-I-9).
        const buffer = long(((p.get(1) & 0xffffffffn) << 32n) | (p.a & 0xffffffffn));
        p.result = shr(buffer, p.b) & 0xffffffffn;
        d.fOverflow = p.b === 1n && this.getBit(p.a, 31) !== this.getBit(p.result, 31);
        d.fCarry = this.getBit(buffer, p.b - 1n);
        this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
      }
    }
    p.put(0, p.result, null);
  }
}
