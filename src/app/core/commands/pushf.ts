import { Address } from '../address';
import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/** PUSHF, PUSHFD, LAHF: bit 1 always set; CF PF AF ZF SF TF DF OF at 0 2 4 6 7 8 10 11. */
export class PushF extends Command {
  readonly mnemonics = ['PUSHF', 'PUSHFD', 'LAHF'];

  validate(p: Parameters) {
    return p.validate(0, Op.NULL);
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    const size = p.mnemo.endsWith('D') ? 4 : 2;
    let word = 2n;
    word = this.setBit(word, d.fCarry, 0);
    word = this.setBit(word, d.fParity, 2);
    word = this.setBit(word, d.fAuxiliary, 4);
    word = this.setBit(word, d.fZero, 6);
    word = this.setBit(word, d.fSign, 7);
    word = this.setBit(word, d.fTrap, 8);
    word = this.setBit(word, d.fDirection, 10);
    word = this.setBit(word, d.fOverflow, 11);
    if (p.mnemo.startsWith('L')) {
      p.putAddress(d.AH, word & 0xffn, null);
    } else {
      p.push(Address.ofValue(Op.IMM, size, word));
    }
  }
}
