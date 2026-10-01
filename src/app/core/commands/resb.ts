import { PseudoCommand } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** RESB, RESW, RESD, RESQ: reserve uninitialized data. */
export class Resb extends PseudoCommand {
  readonly mnemonics = ['RESB', 'RESW', 'RESD', 'RESQ'];

  override signed(): boolean {
    return true;
  }

  validate(p: Parameters) {
    const e = p.validate(0, Op.IMM | Op.CONST);
    if (e) return e;
    const howMany = p.get(0) * BigInt(PseudoCommand.operationSize(p.mnemo));
    if (howMany < 1n || howMany > BigInt(this.dsp.memorySize)) {
      return p.error(0, 'invalid reservation size');
    }
    return p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    const size = PseudoCommand.operationSize(p.mnemo);
    const count = Number(p.get(0));
    const a = this.dsp.malloc(size, count);
    if (!a) return;
    if (p.label !== null) this.dsp.setVariableAddress(p.label, a.address);
    a.size = size * count;
    this.dsp.setDirty(a);
  }
}
