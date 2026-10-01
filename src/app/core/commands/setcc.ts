import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** The 30 condition codes of CMOVcc/SETcc (07 Q-I-11). */
const CONDITIONS = [
  'A',
  'AE',
  'B',
  'BE',
  'C',
  'E',
  'G',
  'GE',
  'L',
  'LE',
  'NA',
  'NAE',
  'NB',
  'NBE',
  'NC',
  'NE',
  'NG',
  'NGE',
  'NL',
  'NLE',
  'NO',
  'NP',
  'NS',
  'NZ',
  'O',
  'P',
  'PE',
  'PO',
  'S',
  'Z',
];

/**
 * SETcc r8/m8: dest := cc ? 1 : 0. The original validated operand 1 instead of 0 and
 * registered only 22 forms (07 Q-I-11, FIX).
 */
export class Setcc extends Command {
  readonly mnemonics = CONDITIONS.map((cc) => `SET${cc}`);

  validate(p: Parameters) {
    return p.validate(0, Op.R8 | Op.M8) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    p.put(0, this.testCC(p.mnemo.substring(3)) ? 1n : 0n, null);
  }
}
