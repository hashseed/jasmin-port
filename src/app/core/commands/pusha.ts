import { Address } from '../address';
import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** PUSHA: push AX, CX, DX, BX, original SP, BP, SI, DI (16-bit each). */
export class PushA extends Command {
  readonly mnemonics = ['PUSHA'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    const esp = d.shortcut(d.ESP);
    p.push(d.AX);
    p.push(d.CX);
    p.push(d.DX);
    p.push(d.BX);
    p.push(Address.ofValue(Op.IMM, 2, esp));
    p.push(d.BP);
    p.push(d.SI);
    p.push(d.DI);
  }
}
