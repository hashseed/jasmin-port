import { Address } from '../address';
import { Command, Flag } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

const FAMILIES = ['LODS', 'STOS', 'SCAS', 'MOVS', 'CMPS'];

/** String instructions with optional REP prefixes (spec 05). */
export class Lods extends Command {
  readonly mnemonics = FAMILIES.flatMap((f) => [f, `${f}B`, `${f}W`, `${f}D`]);

  override overrideMaxMemAccess(mnemo: string): boolean {
    return mnemo.startsWith('MOVS') || mnemo.startsWith('CMPS');
  }

  validate(p: Parameters) {
    const explicit = p.mnemo.length === 4;
    const e = explicit
      ? p.validate(0, Op.M8 | Op.M16 | Op.M32 | Op.PREFIX)
      : p.validate(0, Op.PREFIX | Op.NULL);
    if (e) return e;
    let position = 0;
    if (p.type(0) === Op.PREFIX) {
      if (/^(MOVS|LODS|STOS)/.test(p.mnemo)) {
        if (p.arg(0) !== 'REP') return p.error(0, 'Only the REP prefix is allowed here');
      } else if (p.arg(0).length <= 3) {
        // Message typo fixed (07 Q-P-6).
        return p.error(0, 'Only the REPE/REPZ/REPNE/REPNZ prefixes are allowed here');
      }
      position++;
    }
    if (!explicit) return p.validate(position, Op.NULL);
    const operand = p.validate(position, Op.M8 | Op.M16 | Op.M32);
    if (operand) return operand;
    if (p.mnemo === 'MOVS' || p.mnemo === 'CMPS') {
      // The second operand may leave its size to the first (`movs byte [edi], [esi]`).
      return (
        p.validate(position + 1, p.type(position) | Op.MU) ?? p.validate(position + 2, Op.NULL)
      );
    }
    return p.validate(position + 1, Op.NULL);
  }

  private step(register: Address, amount: number): void {
    const d = this.dsp;
    d.putNum(d.registers.get(register) + (d.fDirection ? -amount : amount), register, null);
  }

  private memAt(register: Address, size: number): Address {
    return new Address(Op.MEM, size, this.dsp.registers.get(register) | 0);
  }

  private executeOnce(p: Parameters): void {
    const d = this.dsp;
    if (p.mnemo.length !== 4) {
      if (p.mnemo.endsWith('B')) p.size = 1;
      else if (p.mnemo.endsWith('W')) p.size = 2;
      else if (p.mnemo.endsWith('D')) p.size = 4;
    }
    const accumulator = d.getMatchingRegister(d.EAX, p.size)!;
    // All operands have at most 4 bytes, so the values are numbers.
    let dest: Address;
    let src: number;
    if (p.mnemo.startsWith('SCAS') || p.mnemo.startsWith('CMPS')) {
      const scas = p.mnemo.startsWith('SCAS');
      const a = scas ? p.getAddressNum(accumulator) : p.getAddressNum(this.memAt(d.ESI, p.size));
      const subtrahend = p.getAddressNum(this.memAt(d.EDI, p.size));
      // a + (-subtrahend), with the subtrahend for AF (07 Q-F-1).
      this.setFlagsNum(
        p.size,
        Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.PF | Flag.CF,
        a,
        -subtrahend,
        a - subtrahend,
        subtrahend,
      );
      if (!scas) this.step(d.ESI, p.size);
      this.step(d.EDI, p.size);
      return;
    }
    if (p.mnemo.startsWith('LODS')) {
      dest = accumulator;
      src = p.getAddressNum(this.memAt(d.ESI, p.size));
      this.step(d.ESI, p.size);
    } else if (p.mnemo.startsWith('STOS')) {
      dest = this.memAt(d.EDI, p.size);
      src = p.getAddressNum(accumulator);
      this.step(d.EDI, p.size);
    } else {
      dest = this.memAt(d.EDI, p.size);
      src = p.getAddressNum(this.memAt(d.ESI, p.size));
      this.step(d.EDI, p.size);
      this.step(d.ESI, p.size);
    }
    p.putAddressNum(dest, src, null);
  }

  private repeatCondition(prefix: string): boolean {
    return prefix === 'REP' || this.testCC(prefix.substring(3));
  }

  execute(p: Parameters): void {
    const d = this.dsp;
    if (p.type(0) === Op.PREFIX) {
      p.size = p.sizeOf(1);
      if (d.registers.get(d.ECX) !== 0) {
        do {
          this.executeOnce(p);
          d.putNum(d.registers.get(d.ECX) - 1, d.ECX, null);
        } while (d.registers.get(d.ECX) !== 0 && this.repeatCondition(p.arg(0)));
      }
    } else {
      p.size = p.sizeOf(0);
      this.executeOnce(p);
    }
  }
}
