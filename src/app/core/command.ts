import { DataSpace } from './data-space';
import { long, shl, shr, sizeMask } from './java';
import { Parameters } from './parameters';
import { ParseError } from './parse-error';

/** Flag selectors for `setFlags`. */
export const Flag = { CF: 1, OF: 2, SF: 4, ZF: 8, PF: 16, AF: 32 } as const;

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
    const bits = p.size * 8;
    const d = this.dsp;
    if (flags & Flag.ZF) d.fZero = long(p.result & sizeMask(p.size)) === 0n;
    if (flags & Flag.SF) d.fSign = (shr(p.result, bits - 1) & 1n) === 1n;
    if (flags & Flag.PF) {
      let ones = 0;
      for (let i = 0; i < 8; i++) ones += Number(shr(p.result, i) & 1n);
      d.fParity = ones % 2 === 0;
    }
    if (flags & Flag.CF) d.fCarry = (shr(p.result, bits) & 1n) === 1n;
    if (flags & Flag.OF) {
      const aSign = (shr(p.a, bits - 1) & 1n) === 1n;
      const bSign = (shr(p.b, bits - 1) & 1n) === 1n;
      const resultSign = (shr(p.result, bits - 1) & 1n) === 1n;
      d.fOverflow = aSign === bSign && resultSign !== aSign;
    }
    if (flags & Flag.AF) {
      // Carry or borrow out of bit 3 (07 Q-F-1): bit 4 of a ^ b ^ result.
      const b = subtrahend ?? p.b;
      d.fAuxiliary = (shr(p.a ^ b ^ p.result, 4) & 1n) === 1n;
    }
  }

  /** Condition-code test for Jcc, CMOVcc, SETcc, LOOPcc. */
  protected testCC(cc: string): boolean {
    const d = this.dsp;
    switch (cc) {
      case 'O':
        return d.fOverflow;
      case 'NO':
        return !d.fOverflow;
      case 'C':
      case 'B':
      case 'NAE':
        return d.fCarry;
      case 'NC':
      case 'NB':
      case 'AE':
        return !d.fCarry;
      case 'E':
      case 'Z':
        return d.fZero;
      case 'NE':
      case 'NZ':
        return !d.fZero;
      case 'BE':
      case 'NA':
        return d.fCarry || d.fZero;
      case 'NBE':
      case 'A':
        return !(d.fCarry || d.fZero);
      case 'S':
        return d.fSign;
      case 'NS':
        return !d.fSign;
      case 'P':
      case 'PE':
        return d.fParity;
      case 'NP':
      case 'PO':
        return !d.fParity;
      case 'L':
      case 'NGE':
        return d.fSign !== d.fOverflow;
      case 'NL':
      case 'GE':
        return d.fSign === d.fOverflow;
      case 'LE':
      case 'NG':
        return d.fSign !== d.fOverflow || d.fZero;
      case 'NLE':
      case 'G':
        return !(d.fSign !== d.fOverflow || d.fZero);
      case 'CXZ':
        return d.shortcut(d.CX) === 0n;
      case 'ECXZ':
        return d.shortcut(d.ECX) === 0n;
      default:
        return false;
    }
  }
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
