import { DataSpace } from './data-space';
import { EVEN_PARITY, Flag } from './flags';
import { long, shl, shr, sizeMask } from './java';
import { Parameters } from './parameters';
import { ParseError } from './parse-error';

export { Flag } from './flags';

/** How the parser treats an instruction's label (spec 03 §7). */
export type CommandKind = 'normal' | 'pseudo' | 'preproc';

/**
 * Base class of every instruction (port of `JasminCommand`). One instance per
 * document, bound to that document's machine.
 */
export abstract class Command {
  /** Mnemonics this class implements. */
  abstract readonly mnemonics: readonly string[];
  readonly kind: CommandKind = 'normal';

  constructor(protected readonly dsp: DataSpace) {}

  /** Operation size when no operand decides it (spec 03 §5). */
  defaultSize(_mnemo: string): number {
    return 4;
  }

  /** Whether operands are read sign-extended. */
  signed(): boolean {
    return false;
  }

  /** Allows more than one memory operand (MOVS/CMPS). */
  overrideMaxMemAccess(_mnemo: string): boolean {
    return false;
  }

  abstract validate(p: Parameters): ParseError | null;
  /** Runs the instruction; may return a runtime error such as `Division by zero`. */
  abstract execute(p: Parameters): ParseError | null | void;

  protected getBit(word: bigint, position: bigint | number): boolean {
    return (word & shl(1n, position)) !== 0n;
  }

  protected setBit(word: bigint, flag: boolean, position: bigint | number): bigint {
    return flag ? word | shl(1n, position) : word & ~shl(1n, position);
  }

  /**
   * Sets the selected flags from `p.a`, `p.b` and `p.result` (`JasminCommand.setFlags`).
   * For subtraction, callers pass the negated subtrahend in `p.b` (as the original
   * does) and the original subtrahend as `subtrahend`, so AF is computed from the
   * real operands (07 Q-F-1).
   */
  protected setFlags(p: Parameters, flags: number, subtrahend?: bigint): void {
    if (p.size > 4) {
      this.setFlagsLong(p, flags, subtrahend);
      return;
    }
    // Operands of at most 32 bits: only bits 0..32 of the 64-bit values matter.
    const low = (value: bigint) => Number(BigInt.asUintN(33, value));
    const b = low(p.b);
    this.setFlagsNum(
      p.size,
      flags,
      low(p.a),
      b,
      low(p.result),
      subtrahend === undefined ? b : low(subtrahend),
    );
  }

  /**
   * `setFlags` on numbers, for operations of `size` <= 4 bytes. `a`, `b` and `result`
   * are the Java long values as exact integers (any sign, |value| < 2^53), or any
   * integers with the same bits 0..32: the flags depend on nothing else. The flags
   * are computed lazily, when first read (`DataSpace.setFlagsLazy`).
   */
  protected setFlagsNum(
    size: number,
    flags: number,
    a: number,
    b: number,
    result: number,
    subtrahend: number,
  ): void {
    this.dsp.setFlagsLazy(size, flags, a, b, result, subtrahend);
  }

  /** `setFlags` for 64-bit operands, on bigints as in the original. */
  private setFlagsLong(p: Parameters, flags: number, subtrahend?: bigint): void {
    const bits = p.size * 8;
    const d = this.dsp;
    if (flags & Flag.ZF) d.fZero = long(p.result & sizeMask(p.size)) === 0n;
    if (flags & Flag.SF) d.fSign = (shr(p.result, bits - 1) & 1n) === 1n;
    if (flags & Flag.PF) d.fParity = EVEN_PARITY[Number(p.result & 0xffn)] === 1;
    if (flags & Flag.CF) d.fCarry = (shr(p.result, bits) & 1n) === 1n;
    if (flags & Flag.OF) {
      const aSign = (shr(p.a, bits - 1) & 1n) === 1n;
      const bSign = (shr(p.b, bits - 1) & 1n) === 1n;
      const resultSign = (shr(p.result, bits - 1) & 1n) === 1n;
      d.fOverflow = aSign === bSign && resultSign !== aSign;
    }
    if (flags & Flag.AF) {
      const b = subtrahend ?? p.b;
      d.fAuxiliary = (shr(p.a ^ b ^ p.result, 4) & 1n) === 1n;
    }
  }

  /** Condition-code test for Jcc, CMOVcc, SETcc, LOOPcc. */
  protected testCC(cc: string): boolean {
    return this.testCondition(conditionCode(cc));
  }

  /**
   * The condition of a mnemonic such as `JNE` (prefix length 1), decoded once per
   * line and kept in `p.condition`.
   */
  protected conditionOf(p: Parameters, prefixLength: number): number {
    if (p.condition < 0) p.condition = conditionCode(p.mnemo.substring(prefixLength));
    return p.condition;
  }

  /** Tests a condition from `conditionCode`. */
  protected testCondition(condition: number): boolean {
    const d = this.dsp;
    switch (condition) {
      case Condition.O:
        return d.fOverflow;
      case Condition.NO:
        return !d.fOverflow;
      case Condition.C:
        return d.fCarry;
      case Condition.NC:
        return !d.fCarry;
      case Condition.Z:
        return d.fZero;
      case Condition.NZ:
        return !d.fZero;
      case Condition.BE:
        return d.fCarry || d.fZero;
      case Condition.A:
        return !(d.fCarry || d.fZero);
      case Condition.S:
        return d.fSign;
      case Condition.NS:
        return !d.fSign;
      case Condition.P:
        return d.fParity;
      case Condition.NP:
        return !d.fParity;
      case Condition.L:
        return d.fSign !== d.fOverflow;
      case Condition.GE:
        return d.fSign === d.fOverflow;
      case Condition.LE:
        return d.fSign !== d.fOverflow || d.fZero;
      case Condition.G:
        return !(d.fSign !== d.fOverflow || d.fZero);
      case Condition.CXZ:
        return d.registers.get(d.CX) === 0;
      case Condition.ECXZ:
        return d.registers.get(d.ECX) === 0;
      case Condition.ALWAYS:
        return true;
      default:
        return false;
    }
  }
}

/** Condition codes of `testCondition`; synonyms (B, NAE = C; E = Z; ...) share one. */
export const Condition = {
  O: 0,
  NO: 1,
  C: 2,
  NC: 3,
  Z: 4,
  NZ: 5,
  BE: 6,
  A: 7,
  S: 8,
  NS: 9,
  P: 10,
  NP: 11,
  L: 12,
  GE: 13,
  LE: 14,
  G: 15,
  CXZ: 16,
  ECXZ: 17,
  ALWAYS: 18,
  NEVER: 19,
} as const;

const CONDITION_CODES = new Map<string, number>([
  ['O', Condition.O],
  ['NO', Condition.NO],
  ['C', Condition.C],
  ['B', Condition.C],
  ['NAE', Condition.C],
  ['NC', Condition.NC],
  ['NB', Condition.NC],
  ['AE', Condition.NC],
  ['E', Condition.Z],
  ['Z', Condition.Z],
  ['NE', Condition.NZ],
  ['NZ', Condition.NZ],
  ['BE', Condition.BE],
  ['NA', Condition.BE],
  ['NBE', Condition.A],
  ['A', Condition.A],
  ['S', Condition.S],
  ['NS', Condition.NS],
  ['P', Condition.P],
  ['PE', Condition.P],
  ['NP', Condition.NP],
  ['PO', Condition.NP],
  ['L', Condition.L],
  ['NGE', Condition.L],
  ['NL', Condition.GE],
  ['GE', Condition.GE],
  ['LE', Condition.LE],
  ['NG', Condition.LE],
  ['NLE', Condition.G],
  ['G', Condition.G],
  ['CXZ', Condition.CXZ],
  ['ECXZ', Condition.ECXZ],
]);

/** The condition code of a condition suffix (`NE`, `GE`, ...); unknown ones never hold. */
export function conditionCode(cc: string): number {
  return CONDITION_CODES.get(cc) ?? Condition.NEVER;
}

/** Data directives (`DB`, `RESB`, ...): their label becomes a variable. */
export abstract class PseudoCommand extends Command {
  override readonly kind: CommandKind = 'pseudo';

  /** 1, 2, 4 or 8 from the mnemonic's last letter. */
  protected static operationSize(mnemo: string): number {
    if (mnemo.endsWith('B')) return 1;
    if (mnemo.endsWith('W')) return 2;
    if (mnemo.endsWith('D')) return 4;
    if (mnemo.endsWith('Q')) return 8;
    return 0;
  }
}

/** Parse-time directives (`EQU`): their label becomes a constant. */
export abstract class PreprocCommand extends Command {
  override readonly kind: CommandKind = 'preproc';
}

/** FPU instructions: default size 8, signed (`FpuCommand`). */
export abstract class FpuCommand extends Command {
  override defaultSize(_mnemo: string): number {
    return 8;
  }

  override signed(): boolean {
    return true;
  }

  protected get fpu() {
    return this.dsp.fpu;
  }
}

export type CommandClass = new (dsp: DataSpace) => Command;
