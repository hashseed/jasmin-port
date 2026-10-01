import { Command } from '../command';
import { int } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';

/**
 * POPF, POPFD, SAHF. POPF(D) on an empty stack does nothing and raises no error
 * (07 Q-I-15, KEEP); "empty" is measured against the top of memory instead of EBP
 * (07 Q-S-1), so `mov ebp, esp` no longer blocks popping the flags.
 */
export class PopF extends Command {
  readonly mnemonics = ['POPF', 'POPFD', 'SAHF'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    const size = p.mnemo.endsWith('D') ? 4 : 2;
    let word: bigint;
    if (p.mnemo.startsWith('S')) {
      word = int(p.getAddress(d.AH));
    } else {
      if (d.shortcut(d.ESP) + BigInt(size) > BigInt(d.memoryEnd)) return;
      word = int(p.popValue(size));
    }
    d.fCarry = this.getBit(word, 0);
    d.fParity = this.getBit(word, 2);
    d.fAuxiliary = this.getBit(word, 4);
    d.fZero = this.getBit(word, 6);
    d.fSign = this.getBit(word, 7);
    if (p.mnemo.startsWith('P')) {
      d.fTrap = this.getBit(word, 8);
      d.fDirection = this.getBit(word, 10);
      d.fOverflow = this.getBit(word, 11);
    }
  }
}
