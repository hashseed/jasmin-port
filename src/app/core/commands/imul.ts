import { Command } from '../command';
import { long, mulHighS32, shr } from '../java';
import { Op, matches } from '../op';
import { Parameters } from '../parameters';

/**
 * IMUL with one, two or three operands (signed). CF = OF = 1 iff the full product
 * differs from the sign-extended truncated result (07 Q-I-2).
 */
export class Imul extends Command {
  readonly mnemonics = ['IMUL'];

  override signed(): boolean {
    return true;
  }

  validate(p: Parameters) {
    const e = p.validate(3, Op.NULL);
    if (e) return e;
    if (p.validate(2, Op.NULL) === null) return this.validate2(p);
    return (
      p.validate(2, Op.IMM | Op.CONST) ??
      p.validate(1, Op.MEM | Op.REG) ??
      p.validate(0, Op.REG) ??
      p.consistentSizes()
    );
  }

  private validate2(p: Parameters) {
    if (p.validate(1, Op.NULL) === null) return p.validate(0, Op.REG | Op.MEM);
    return p.validate(1, Op.MEM | Op.REG | Op.IMM | Op.CONST) ?? p.validate(0, Op.REG);
  }

  private setCarryOverflow(product: bigint, bits: number): void {
    this.dsp.fOverflow = this.dsp.fCarry = BigInt.asIntN(bits, product) !== product;
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    if (p.validate(2, Op.NULL) === null) {
      if (p.validate(1, Op.NULL) === null) {
        this.ex1(p);
        return;
      }
      p.a = p.get(0);
      p.b = p.get(1);
    } else {
      p.a = p.get(1);
      p.b = p.get(2);
    }
    if (p.size !== 1 && p.size !== 2 && p.size !== 4) return;
    const bits = p.size * 8;
    p.b = long(p.b * p.a);
    p.put(0, BigInt.asUintN(bits, p.b), null);
    p.result = BigInt.asUintN(bits, shr(p.b, bits));
    this.setCarryOverflow(p.b, bits);
  }

  /**
   * `execute` on numbers. Math.imul gives the low 32 bits of any product. Below
   * 2^62 in magnitude the Java long product does not wrap, and its rounded double
   * is out of the destination's signed range exactly when the product is, since
   * rounding is monotonic and the bounds are powers of two. Larger products (only
   * with large immediates) are computed as bigints.
   */
  private executeNum(p: Parameters): void {
    let a: number;
    let b: number;
    if (matches(p.type(2), Op.NULL)) {
      if (matches(p.type(1), Op.NULL)) {
        this.ex1Num(p);
        return;
      }
      a = p.getNum(0);
      b = p.getNum(1);
    } else {
      a = p.getNum(1);
      b = p.getNum(2);
    }
    if (p.size !== 1 && p.size !== 2 && p.size !== 4) return;
    const bits = p.size * 8;
    const approx = b * a;
    if (Math.abs(approx) >= 2 ** 62) {
      const product = long(BigInt(b) * BigInt(a));
      p.put(0, BigInt.asUintN(bits, product), null);
      this.setCarryOverflow(product, bits);
      return;
    }
    p.putNum(0, Math.imul(b, a), null);
    const limit = 2 ** (bits - 1);
    this.dsp.fOverflow = this.dsp.fCarry = approx < -limit || approx >= limit;
  }

  /** `ex1` on numbers: the operands are signed values of at most 32 bits. */
  private ex1Num(p: Parameters): void {
    const d = this.dsp;
    const a = p.getNum(0);
    if (p.size === 1) {
      const ax = p.getAddressNum(d.AL) * a;
      p.putAddressNum(d.AX, ax, null);
      d.fOverflow = d.fCarry = ax < -0x80 || ax >= 0x80;
    } else if (p.size === 2) {
      const dxax = p.getAddressNum(d.AX) * a;
      p.putAddressNum(d.AX, dxax & 0xffff, null);
      p.putAddressNum(d.DX, (dxax >> 16) & 0xffff, null);
      d.fOverflow = d.fCarry = dxax < -0x8000 || dxax >= 0x8000;
    } else if (p.size === 4) {
      const eax = p.getAddressNum(d.EAX);
      const low = Math.imul(eax, a);
      const high = mulHighS32(eax, a);
      p.putAddressNum(d.EAX, low >>> 0, null);
      p.putAddressNum(d.EDX, high >>> 0, null);
      // The product fits in 32 bits iff the high half is the sign extension of the low.
      d.fOverflow = d.fCarry = high !== low >> 31;
    }
  }

  private ex1(p: Parameters): void {
    const d = this.dsp;
    p.a = p.get(0);
    if (p.size === 1) {
      const ax = long(p.getAddress(d.AL) * p.a);
      p.putAddress(d.AX, ax, null);
      p.result = shr(ax, 8) & 0xffn;
      this.setCarryOverflow(ax, 8);
    } else if (p.size === 2) {
      const dxax = long(p.getAddress(d.AX) * p.a);
      p.putAddress(d.AX, dxax & 0xffffn, null);
      p.result = shr(dxax, 16) & 0xffffn;
      p.putAddress(d.DX, p.result, null);
      this.setCarryOverflow(dxax, 16);
    } else if (p.size === 4) {
      const edxeax = long(p.getAddress(d.EAX) * p.a);
      p.putAddress(d.EAX, edxeax & 0xffffffffn, null);
      p.result = shr(edxeax, 32) & 0xffffffffn;
      p.putAddress(d.EDX, p.result, null);
      this.setCarryOverflow(edxeax, 32);
    }
  }
}
