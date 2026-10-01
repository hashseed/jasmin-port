import { Command } from '../command';
import { long, shr } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** MUL (unsigned): AX := AL * src, DX:AX := AX * src or EDX:EAX := EAX * src. */
export class Mul extends Command {
  readonly mnemonics = ['MUL'];

  validate(p: Parameters) {
    return p.validate(0, Op.MEM | Op.REG) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
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
}
