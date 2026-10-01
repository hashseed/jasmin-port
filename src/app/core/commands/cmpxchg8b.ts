import { Command } from '../command';
import { long, shl, shr } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** CMPXCHG8B m64. */
export class Cmpxchg8b extends Command {
  readonly mnemonics = ['CMPXCHG8B'];

  override defaultSize(_mnemo: string): number {
    return 8;
  }

  validate(p: Parameters) {
    return p.validate(0, Op.M64 | Op.MU) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    p.argument(0).address.size = 8;
    p.b = p.get(0);
    if (p.b === long(shl(d.shortcut(d.EDX), 32) | d.shortcut(d.EAX))) {
      d.fZero = true;
      p.put(0, long(shl(d.shortcut(d.ECX), 32) | d.shortcut(d.EBX)), null);
    } else {
      d.fZero = false;
      p.putAddress(d.EAX, 0xffffffffn & p.b, null);
      p.putAddress(d.EDX, shr(p.b, 32), null);
    }
  }
}
