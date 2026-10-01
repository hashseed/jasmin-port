import { Command } from '../command';
import { long, shr } from '../java';
import { Op } from '../op';
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
