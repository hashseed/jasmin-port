import { Command } from '../command';
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
    // Register operands only, read sign-extended: numbers suffice.
    switch (p.mnemo) {
      case 'CBW':
        p.putAddressNum(d.AX, p.getAddressNum(d.AL), null);
        break;
      case 'CWDE':
        p.putAddressNum(d.EAX, p.getAddressNum(d.AX), null);
        break;
      case 'CWD':
        // The sign of AX: (AX >> 16) & 0xFFFF as a long.
        p.putAddressNum(d.DX, (p.getAddressNum(d.AX) >> 16) & 0xffff, null);
        break;
      case 'CDQ':
        // The sign of EAX: EAX >> 32 as a long, i.e. 0 or -1.
        p.putAddressNum(d.EDX, p.getAddressNum(d.EAX) >> 31, null);
        break;
    }
  }
}
