import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/**
 * JASMINSLEEP n: pause for n milliseconds. Execution only records the request in
 * `pendingSleepMs`; the run loop honors it (the headless runner ignores it).
 */
export class JasminSleep extends Command {
  readonly mnemonics = ['JASMINSLEEP'];

  validate(p: Parameters) {
    return (
      p.validate(0, Op.IMM | Op.REG | Op.MEM | Op.VARIABLE | Op.CONST) ?? p.validate(1, Op.NULL)
    );
  }

  execute(p: Parameters): void {
    this.dsp.pendingSleepMs = Number(p.get(0));
  }
}
