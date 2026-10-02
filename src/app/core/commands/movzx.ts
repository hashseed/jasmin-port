import { Command } from '../command';
import { Op } from '../op';
import { Parameters } from '../parameters';

/**
 * Shared MOVZX/MOVSX validation: r16 <- r8/m8; r32 <- r8/r16/m8/m16. Memory of
 * undecided size is rejected (07 Q-I-6; the original checked the source type
 * instead of the destination's).
 */
export function validateExtension(p: Parameters) {
  const e = p.validate(0, Op.R16 | Op.R32);
  if (e) return e;
  const source =
    p.type(0) === Op.R16
      ? p.validate(1, Op.R8 | Op.M8)
      : p.validate(1, Op.R8 | Op.R16 | Op.M8 | Op.M16);
  return source ?? p.validate(2, Op.NULL);
}

/** MOVZX: zero-extending move. */
export class Movzx extends Command {
  readonly mnemonics = ['MOVZX'];

  validate(p: Parameters) {
    return validateExtension(p);
  }

  execute(p: Parameters): void {
    if (p.numeric) p.putNum(0, p.getNum(1), null);
    else p.put(0, p.get(1), null);
  }
}
