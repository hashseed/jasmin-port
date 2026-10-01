import { Command } from '../command';
import { int } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** CALL: push EIP (4 bytes, already the next line), then jump (spec 05 §5). */
export class Call extends Command {
  readonly mnemonics = ['CALL'];

  validate(p: Parameters) {
    return p.validate(0, Op.LABEL | Op.MEM | Op.REG | Op.IMM) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    p.a = p.get(0);
    p.push(this.dsp.EIP);
    this.dsp.setInstructionPointer(Number(int(p.a)));
  }
}
