import { Command } from '../command';
import { long, mulHighU32, shr } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** MUL (unsigned): AX := AL * src, DX:AX := AX * src or EDX:EAX := EAX * src. */
export class Mul extends Command {
  readonly mnemonics = ['MUL'];

  validate(p: Parameters) {
    return p.validate(0, Op.MEM | Op.REG) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    const d = this.dsp;
    p.a = p.get(0);
    if (p.size === 1) {
      const ax = long(d.shortcut(d.AL) * p.a);
      p.putAddress(d.AX, ax, null);
      p.result = shr(ax, 8) & 0xffn;
    } else if (p.size === 2) {
      const dxax = long(d.shortcut(d.AX) * p.a);
      p.putAddress(d.AX, dxax & 0xffffn, null);
      p.result = shr(dxax, 16) & 0xffffn;
      p.putAddress(d.DX, p.result, null);
    } else if (p.size === 4) {
      const edxeax = long(d.shortcut(d.EAX) * p.a);
      p.putAddress(d.EAX, edxeax & 0xffffffffn, null);
      p.result = shr(edxeax, 32) & 0xffffffffn;
      p.putAddress(d.EDX, p.result, null);
    }
    d.fOverflow = d.fCarry = p.result !== 0n;
  }

  /** `execute` on numbers; the 32-bit product's high half comes from `mulHighU32`. */
  private executeNum(p: Parameters): void {
    const d = this.dsp;
    const a = p.getNum(0);
    let high = 0;
    if (p.size === 1) {
      const ax = d.registers.get(d.AL) * a;
      p.putAddressNum(d.AX, ax, null);
      high = ax >>> 8;
    } else if (p.size === 2) {
      const dxax = d.registers.get(d.AX) * a;
      p.putAddressNum(d.AX, dxax & 0xffff, null);
      high = dxax >>> 16;
      p.putAddressNum(d.DX, high, null);
    } else if (p.size === 4) {
      const eax = d.registers.get(d.EAX);
      p.putAddressNum(d.EAX, Math.imul(eax, a) >>> 0, null);
      high = mulHighU32(eax, a);
      p.putAddressNum(d.EDX, high, null);
    }
    d.fOverflow = d.fCarry = high !== 0;
  }
}
