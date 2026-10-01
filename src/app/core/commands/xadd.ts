import { Command, Flag } from '../command';
import { long } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** XADD dest, src: src := dest; dest := dest + src. */
export class Xadd extends Command {
  readonly mnemonics = ['XADD'];

  validate(p: Parameters) {
    return p.consistentSizes() ?? p.validate(0, Op.REG | Op.MEM) ?? p.validate(1, Op.REG);
  }

  execute(p: Parameters): void {
    p.prepareAB();
    p.result = long(p.a + p.b);
    this.setFlags(p, Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.CF | Flag.PF);
    p.put(1, p.get(0), null);
    p.put(0, p.result, null);
  }
}
