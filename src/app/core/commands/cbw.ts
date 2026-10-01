import { Command } from '../command';
import { shr } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** CBW, CWDE, CWD, CDQ (signed). */
export class Cbw extends Command {
  readonly mnemonics = ['CBW', 'CWDE', 'CWD', 'CDQ'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  override signed(): boolean {
    return true;
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    switch (p.mnemo) {
      case 'CBW':
        p.putAddress(d.AX, p.getAddress(d.AL), null);
        break;
      case 'CWDE':
        p.putAddress(d.EAX, p.getAddress(d.AX), null);
        break;
      case 'CWD':
        p.a = shr(p.getAddress(d.AX), 16) & 0xffffn;
        p.putAddress(d.DX, p.a, null);
        break;
      case 'CDQ':
        p.a = shr(p.getAddress(d.EAX), 32);
        p.putAddress(d.EDX, p.a, null);
        break;
    }
  }
}
