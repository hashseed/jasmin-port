import { Command } from '../command';
import { long, shl } from '../java';
import { Op } from '../op';
import { Parameters } from '../parameters';
import { ParseError } from '../parse-error';

/**
 * DIV, IDIV. Division by zero and a quotient that does not fit are runtime errors
 * that change no register (07 Q-I-3). The dividend's low half is always read
 * unsigned, so negative 32-bit IDIV dividends work (07 Q-I-1).
 */
export class Div extends Command {
  readonly mnemonics = ['DIV', 'IDIV'];

  validate(p: Parameters) {
    return p.validate(0, Op.MEM | Op.REG) ?? p.validate(1, Op.NULL);
  }

  execute(p: Parameters): ParseError | null {
    const d = this.dsp;
    const signed = p.mnemo === 'IDIV';
    if (signed) p.signed = true;
    p.a = p.get(0);
    const bits = p.size * 8;
    let dividend: bigint;
    if (p.size === 1) {
      dividend = p.getAddress(d.AX);
    } else if (p.size === 2) {
      dividend = long(shl(p.getAddress(d.DX), 16) | d.shortcut(d.AX));
    } else if (p.size === 4) {
      dividend = (p.getAddress(d.EDX) << 32n) + d.shortcut(d.EAX);
    } else {
      return null;
    }
    if (p.a === 0n) return ParseError.runtime('Division by zero');
    // BigInt division truncates toward zero; the remainder has the dividend's sign.
    const quotient = dividend / p.a;
    const remainder = dividend - quotient * p.a;
    const fits = signed
      ? quotient >= -(1n << BigInt(bits - 1)) && quotient < 1n << BigInt(bits - 1)
      : quotient >= 0n && quotient < 1n << BigInt(bits);
    if (!fits) return ParseError.runtime('Division overflow');
    if (p.size === 1) {
      p.putAddress(d.AL, quotient, null);
      p.putAddress(d.AH, remainder, null);
    } else if (p.size === 2) {
      p.putAddress(d.AX, quotient, null);
      p.putAddress(d.DX, remainder, null);
    } else {
      p.putAddress(d.EAX, quotient, null);
      p.putAddress(d.EDX, remainder, null);
    }
    return null;
  }
}
