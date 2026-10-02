import { Command, Condition, conditionCode } from '../command';
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

  execute(p: Parameters): void {
    // The target as Java `(int)`: its low 32 bits, signed.
    const target = p.numeric ? p.getNum(0) | 0 : Number(int(p.get(0)));
    if (p.condition < 0) {
      p.condition = p.mnemo === 'JMP' ? Condition.ALWAYS : conditionCode(p.mnemo.substring(1));
    }
    if (this.testCondition(p.condition)) this.dsp.setInstructionPointer(target);
  }
}
