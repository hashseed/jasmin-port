import { Command } from '../command';
import { Op, matches } from '../op';
import { Parameters } from '../parameters';

/** BT, BTC, BTR, BTS (spec 05 §3). */
export class Bt extends Command {
  readonly mnemonics = ['BT', 'BTC', 'BTR', 'BTS'];

  override defaultSize(_mnemo: string): number {
    return 2;
  }

  validate(p: Parameters) {
    return (
      p.validate(0, Op.R16 | Op.R32 | Op.M16 | Op.M32 | Op.MU) ??
      p.validate(1, Op.R16 | Op.R32 | Op.I8) ??
      p.consistentSizes() ??
      p.validate(2, Op.NULL)
    );
  }

  execute(p: Parameters): void {
    if (p.numeric) {
      this.executeNum(p);
      return;
    }
    let offset = p.get(1);
    // Register destinations work on a copy of the register handle (07 Q-I-5).
    const a = p.argument(0).address.clone();
    if (matches(p.type(0), Op.REG)) offset = offset % BigInt(p.sizeOf(0) * 8);
    if (matches(p.type(0), Op.MEM)) {
      const arg = p.argument(0);
      if (arg.cAddress) a.address = arg.cAddress.calculateEffectiveAddress(true);
      a.address = (a.address + Number(offset / 8n)) | 0;
      offset = offset % 8n;
    }
    const d = this.dsp;
    d.fCarry = this.getBit(p.getAddress(a), offset);
    if (p.mnemo.endsWith('C')) {
      p.putAddress(a, this.setBit(p.getAddress(a), !d.fCarry, offset), null);
    } else if (p.mnemo.endsWith('S')) {
      p.putAddress(a, this.setBit(p.getAddress(a), true, offset), null);
    } else if (p.mnemo.endsWith('R')) {
      p.putAddress(a, this.setBit(p.getAddress(a), false, offset), null);
    }
  }

  /**
   * `execute` on numbers: the bit offset is below 2^32 and, once reduced, below 32,
   * and the operand has at most 32 bits.
   */
  private executeNum(p: Parameters): void {
    let offset = p.getNum(1);
    // Register destinations work on a copy of the register handle (07 Q-I-5).
    const a = p.argument(0).address.clone();
    if (matches(p.type(0), Op.REG)) offset = offset % (p.sizeOf(0) * 8);
    if (matches(p.type(0), Op.MEM)) {
      const arg = p.argument(0);
      if (arg.cAddress) a.address = arg.cAddress.calculateEffectiveAddress(true);
      a.address = (a.address + Math.floor(offset / 8)) | 0;
      offset = offset % 8;
    }
    const d = this.dsp;
    const bit = 1 << offset;
    d.fCarry = (p.getAddressNum(a) & bit) !== 0;
    if (p.mnemo.endsWith('C')) {
      const value = p.getAddressNum(a);
      p.putAddressNum(a, d.fCarry ? value & ~bit : value | bit, null);
    } else if (p.mnemo.endsWith('S')) {
      p.putAddressNum(a, p.getAddressNum(a) | bit, null);
    } else if (p.mnemo.endsWith('R')) {
      p.putAddressNum(a, p.getAddressNum(a) & ~bit, null);
    }
  }
}
