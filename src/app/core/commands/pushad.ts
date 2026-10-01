import { Address } from '../address';
import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** PUSHAD: push EAX, ECX, EDX, EBX, original ESP, EBP, ESI, EDI. */
export class PushAD extends Command {
  readonly mnemonics = ['PUSHAD'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    const esp = d.shortcut(d.ESP);
    p.push(d.EAX);
    p.push(d.ECX);
    p.push(d.EDX);
    p.push(d.EBX);
    p.push(Address.ofValue(Op.IMM, 4, esp));
    p.push(d.EBP);
    p.push(d.ESI);
    p.push(d.EDI);
  }
}
