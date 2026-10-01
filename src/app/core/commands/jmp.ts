import { Command } from '../command';
import { int } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** JMP, Jcc, JCXZ, JECXZ (spec 05 §5). */
export class Jmp extends Command {
  readonly mnemonics = [
    'JMP',
    'JCXZ',
    'JECXZ',
    'JA',
    'JAE',
    'JB',
    'JBE',
    'JC',
    'JE',
    'JG',
    'JGE',
    'JL',
    'JLE',
    'JNA',
    'JNAE',
    'JNB',
    'JNBE',
    'JNC',
    'JNE',
    'JNG',
    'JNGE',
    'JNL',
    'JNLE',
    'JNO',
    'JNP',
    'JNS',
    'JNZ',
    'JO',
    'JP',
    'JPE',
    'JPO',
    'JS',
    'JZ',
  ];

  validate(p: Parameters) {
    return p.validate(0, Op.LABEL | Op.MEM | Op.REG | Op.IMM | Op.CONST) ?? p.validate(1, Op.NULL);
  }

  private testCondition(mnemo: string): boolean {
    return mnemo === 'JMP' || this.testCC(mnemo.substring(1));
  }

  execute(p: Parameters): void {
    p.a = p.get(0);
    if (this.testCondition(p.mnemo)) this.dsp.setInstructionPointer(Number(int(p.a)));
  }
}
