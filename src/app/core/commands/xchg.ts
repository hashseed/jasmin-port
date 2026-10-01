import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** XCHG: (m, r) or (r, r/m). */
export class Xchg extends Command {
  readonly mnemonics = ['XCHG'];

  validate(p: Parameters) {
    const e = p.consistentSizes();
    if (e) return e;
    if (p.validate(0, Op.MEM) === null) return p.validate(1, Op.REG);
    return p.validate(0, Op.REG) ?? p.validate(1, Op.MEM | Op.REG);
  }

  execute(p: Parameters): void {
    const tmp = p.get(1);
    p.put(1, p.get(0), null);
    p.put(0, tmp, null);
  }
}
