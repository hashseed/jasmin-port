import { Address } from './address';
import { DataSpace } from './data-space';
import { parseInt32, toInt32 } from './java';

/** Registers usable in operands and addresses (all but EIP). */
const REG = '(EAX|AX|AL|AH|EBX|BX|BL|BH|ECX|CX|CL|CH|EDX|DX|DL|DH|ESI|SI|EDI|DI|ESP|SP|EBP|BP)';
export const REGISTER_PATTERN = new RegExp(`^${REG}$`);

const exact = (body: string) => new RegExp(`^${body}$`);
const pDecimal = /^-?\d+$/;
const pBasePlusDisplacement = exact(`${REG}\\+\\d+`);
const pBaseMinusDisplacement = exact(`${REG}-\\d+`);
const pIndexScale = exact(`${REG}\\*\\d+`);
const pIndexScalePlusDisplacement = exact(`${REG}\\*\\d+\\+\\d+`);
const pIndexScaleMinusDisplacement = exact(`${REG}\\*\\d+-\\d+`);
const pBaseIndexPlusDisplacement = exact(`${REG}\\+${REG}\\+\\d+`);
const pBaseIndexMinusDisplacement = exact(`${REG}\\+${REG}-\\d+`);
const pBaseIndexScale = exact(`${REG}\\+${REG}\\*\\d+`);
const pBaseIndex = exact(`${REG}[+-]${REG}`);
const pBaseIndexScalePlusDisplacement = exact(`${REG}\\+${REG}\\*\\d+\\+\\d+`);
const pBaseIndexScaleMinusDisplacement = exact(`${REG}\\+${REG}\\*\\d+-\\d+`);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * An effective address `[base + index*scale + displacement]` (port of
 * `CalculatedAddress`, spec 03 §6).
 */
export class CalculatedAddress {
  private base: Address | null = null;
  private index: Address | null = null;
  private scale = 0;
  private displacement = 0;
  usedLabels = new Set<string>();

  constructor(private readonly dsp: DataSpace) {}

  /** Null if the address is usable for an access of `size` bytes, else the error message. */
  isValid(size: number, executeNow: boolean): string | null {
    if (!(this.index === null || [1, 2, 4, 8].includes(this.scale))) {
      return 'Scale factor must be either 1, 2, 4, or 8.';
    }
    if (this.index === this.dsp.ESP) return 'ESP cannot be used as an index register.';
    if (
      (this.base !== null && this.base.size !== 4) ||
      (this.index !== null && this.index.size !== 4)
    ) {
      return 'Only 32bit registers are valid for address calculation.';
    }
    const ea = this.calculateEffectiveAddress(executeNow);
    if (ea + size > this.dsp.memoryEnd) return 'Memory address out of range';
    if (ea < this.dsp.offset) return 'Memory address out of range';
    return null;
  }

  /** With `executeNow` false, register-based addresses are assumed to be in range. */
  calculateEffectiveAddress(executeNow: boolean): number {
    if (executeNow) {
      const base = this.base ? this.dsp.registers.get(this.base) | 0 : 0;
      const index = this.index ? this.dsp.registers.get(this.index) | 0 : 0;
      return toInt32(base + Math.imul(index, this.scale) + this.displacement);
    }
    if (this.base === null && this.index === null) return this.displacement;
    return this.dsp.offset;
  }

  /** Parses `[...]` text; null on success, else the error message. */
  readFromString(text: string): string | null {
    let s = text;
    if (/^\[.*\]$/.test(s) && s.indexOf(']') !== s.length - 1) return 'Malformed memory address';
    this.usedLabels = new Set();
    const substitute = (name: string, value: string) => {
      const pattern = new RegExp(`[\\[\\-+*]${escapeRegExp(name)}[\\]\\-+*]`, 'g');
      // Like the original, matches are searched in the text before substitution.
      const source = s;
      let pos = 0;
      for (;;) {
        pattern.lastIndex = pos;
        const m = pattern.exec(source);
        if (!m) break;
        const replaced = m[0].split(name).join(value);
        s = s.split(m[0]).join(replaced);
        pos = Math.max(m.index + m[0].length - 1, 0);
        this.usedLabels.add(name);
      }
    };
    for (const variable of this.dsp.getVariableList()) {
      substitute(variable, String(this.dsp.getVariable(variable)));
    }
    for (const constant of this.dsp.getConstantList()) {
      substitute(constant, String(this.dsp.getConstant(constant)));
    }
    try {
      return this.parseInner(s.substring(1, s.length - 1));
    } catch {
      // Integer.valueOf overflow: the original threw; report it as malformed.
      return 'Malformed memory address';
    }
  }

  private reg(name: string): Address {
    return this.dsp.getRegisterArgument(name)!;
  }

  private parseInner(inner: string): string | null {
    let s = inner;
    this.base = this.index = null;
    this.scale = this.displacement = 0;
    if (pDecimal.test(s)) {
      this.displacement = parseInt32(s);
      return null;
    }
    if (REGISTER_PATTERN.test(s)) {
      this.base = this.reg(s);
      return null;
    }
    if (pBasePlusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('+')));
      this.displacement = parseInt32(s.substring(s.indexOf('+') + 1));
      return null;
    }
    if (pBaseMinusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('-')));
      this.displacement = -parseInt32(s.substring(s.indexOf('-') + 1));
      return null;
    }
    if (pIndexScale.test(s)) {
      this.index = this.reg(s.substring(0, s.indexOf('*')));
      this.scale = parseInt32(s.substring(s.indexOf('*') + 1));
      return null;
    }
    if (pIndexScalePlusDisplacement.test(s)) {
      this.index = this.reg(s.substring(0, s.indexOf('*')));
      this.scale = parseInt32(s.substring(s.indexOf('*') + 1, s.indexOf('+')));
      this.displacement = parseInt32(s.substring(s.indexOf('+') + 1));
      return null;
    }
    if (pIndexScaleMinusDisplacement.test(s)) {
      this.index = this.reg(s.substring(0, s.indexOf('*')));
      this.scale = parseInt32(s.substring(s.indexOf('*') + 1, s.indexOf('-')));
      this.displacement = -parseInt32(s.substring(s.indexOf('-') + 1));
      return null;
    }
    if (pBaseIndex.test(s)) s += '+0';
    if (pBaseIndexPlusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('+')));
      this.index = this.reg(s.substring(s.indexOf('+') + 1, s.lastIndexOf('+')));
      this.displacement = parseInt32(s.substring(s.lastIndexOf('+') + 1));
      this.scale = 1;
      return null;
    }
    if (pBaseIndexMinusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('+')));
      this.index = this.reg(s.substring(s.indexOf('+') + 1, s.lastIndexOf('-')));
      this.displacement = -parseInt32(s.substring(s.lastIndexOf('-') + 1));
      this.scale = 1;
      return null;
    }
    if (pBaseIndexScale.test(s)) s += '+0';
    if (pBaseIndexScalePlusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('+')));
      this.index = this.reg(s.substring(s.indexOf('+') + 1, s.indexOf('*')));
      this.scale = parseInt32(s.substring(s.indexOf('*') + 1, s.lastIndexOf('+')));
      this.displacement = parseInt32(s.substring(s.lastIndexOf('+') + 1));
      return null;
    }
    if (pBaseIndexScaleMinusDisplacement.test(s)) {
      this.base = this.reg(s.substring(0, s.indexOf('+')));
      this.index = this.reg(s.substring(s.indexOf('+') + 1, s.indexOf('*')));
      this.scale = parseInt32(s.substring(s.indexOf('*') + 1, s.lastIndexOf('-')));
      this.displacement = -parseInt32(s.substring(s.lastIndexOf('-') + 1));
      return null;
    }
    return 'Malformed memory address';
  }
}
