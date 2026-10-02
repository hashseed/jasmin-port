import { Command, Flag } from '../command';
import { shl, shr } from '../java';
import { Op, matches } from '../op';
import { Parameters } from '../parameters';

/**
 * SHR, SHL, SAR, SAL. The count is masked to 5 bits (07 Q-I-7) and CF is the last
 * bit shifted out (07 Q-I-8).
 */
export class Shr extends Command {
  readonly mnemonics = ['SHR', 'SHL', 'SAR', 'SAL'];

  validate(p: Parameters) {
    const e = p.validate(0, Op.M8 | Op.M16 | Op.M32 | Op.R8 | Op.R16 | Op.R32 | Op.MU);
    if (e) return e;
    if (
      (matches(p.type(1), Op.R8) && p.argument(1).address !== this.dsp.CL) ||
      !matches(p.type(1), Op.R8 | Op.I8)
    ) {
      return p.error(1, 'second argument must be CL or an 8-bit immediate');
    }
    return p.validate(2, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    const d = this.dsp;
    p.a = p.get(0);
    p.b = p.get(1) & 31n;
    if (p.b <= 0n) return;
    const bits = p.sizeOf(0) * 8;
    if (p.mnemo.endsWith('L')) {
      p.result = shl(p.a, p.b);
      p.put(0, p.result, null);
      this.setFlags(p, Flag.CF | Flag.SF | Flag.ZF | Flag.PF);
      if (p.b === 1n) d.fOverflow = d.fCarry !== this.getBit(p.result, bits - 1);
    } else {
      if (p.mnemo === 'SHR') {
        if (p.b === 1n) d.fOverflow = this.getBit(p.a, bits - 1);
      } else {
        // SAR reads the operand sign-extended.
        p.signed = true;
        p.a = p.get(0);
        if (p.b === 1n) d.fOverflow = false;
      }
      p.result = shr(p.a, p.b);
      p.put(0, p.result, null);
      this.setFlags(p, Flag.SF | Flag.ZF | Flag.PF);
      // Last bit shifted out: beyond the operand that is 0 for SHR, the sign for SAR.
      d.fCarry = this.getBit(p.a, p.b - 1n);
    }
  }

  /**
   * `execute` on numbers. The operand has at most 32 bits; the shifted value only
   * matters up to bit 32 (CF of SHL), so 32-bit shifts plus that bit suffice.
   */
  private executeNum(p: Parameters): void {
    const d = this.dsp;
    let a = p.getNum(0);
    // The count is the low 5 bits (also of a sign-extended CL).
    const count = p.getNum(1) & 31;
    if (count === 0) return;
    const bits = p.sizeOf(0) * 8;
    if (p.mnemo.endsWith('L')) {
      // a < 2^32, so the long result a * 2^count does not wrap. `low` holds its low
      // 32 bits; CF is its bit p.size * 8, for 32 bits bit 32 - count of a.
      const low = a << count;
      p.putNum(0, low, null);
      this.setFlagsNum(p.size, Flag.SF | Flag.ZF | Flag.PF, a, count, low, count);
      const flagBits = p.size * 8;
      d.fCarry = flagBits === 32 ? ((a >>> (32 - count)) & 1) === 1 : ((low >> flagBits) & 1) === 1;
      if (count === 1) d.fOverflow = d.fCarry !== (((low >> (bits - 1)) & 1) === 1);
    } else {
      if (p.mnemo === 'SHR') {
        if (count === 1) d.fOverflow = ((a >>> (bits - 1)) & 1) === 1;
      } else {
        // SAR reads the operand sign-extended.
        p.signed = true;
        a = p.getNum(0);
        if (count === 1) d.fOverflow = false;
      }
      // SHR: a is unsigned (below 2^32); SAR: a is a signed 32-bit value.
      const result = p.mnemo === 'SHR' ? a >>> count : a >> count;
      p.putNum(0, result, null);
      this.setFlagsNum(p.size, Flag.SF | Flag.ZF | Flag.PF, a, count, result, count);
      // Last bit shifted out: beyond the operand that is 0 for SHR, the sign for SAR.
      d.fCarry = ((a >> (count - 1)) & 1) === 1;
    }
  }
}
