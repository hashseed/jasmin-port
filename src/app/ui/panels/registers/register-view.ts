import { DataSpace, RegisterSet } from '../../../core';
import { Radix, formatValue, parseValue } from '../radix';

/** `lastSteps` of the original: a value is "recently changed" for one step (spec 04 §8). */
export const LAST_STEPS = 1;

/** One byte field of an expanded register row. */
export interface ByteView {
  /** 0 = least significant byte. */
  readonly index: number;
  readonly text: string;
  readonly changed: boolean;
}

/** What one register row of the registers panel shows (spec 02 §7.2). */
export interface RegisterView {
  readonly name: string;
  readonly set: RegisterSet;
  /** The 32-bit value in the current radix, for the collapsed field. */
  readonly text: string;
  /** Collapsed field bold: any part of the register changed in the last step. */
  readonly changed: boolean;
  /** Byte fields, most significant first. */
  readonly bytes: readonly ByteView[];
  /** 16-bit, 8-bit high and 8-bit low names; '' where the register has none. */
  readonly x: string;
  readonly h: string;
  readonly l: string;
}

/**
 * The register rows for the current machine state and radix. Bold rules follow
 * `RegisterPanel.update`: byte 0 if L or X changed, byte 1 if H or X changed,
 * bytes 2-3 if E changed; a missing part falls back to the next bigger one.
 */
export function registerViews(dsp: DataSpace, radix: Radix): RegisterView[] {
  return dsp.registerSets.map((set) => {
    const value = dsp.registers.get(set.E);
    const dirtyE = dsp.isDirty(set.E, LAST_STEPS);
    const dirtyX = set.X ? dsp.isDirty(set.X, LAST_STEPS) : dirtyE;
    const dirtyL = set.L ? dsp.isDirty(set.L, LAST_STEPS) || dirtyX : dirtyX;
    const dirtyH = set.H ? dsp.isDirty(set.H, LAST_STEPS) || dirtyX : dirtyX;
    const changedByByte = [dirtyL, dirtyH, dirtyE, dirtyE];
    const bytes = [3, 2, 1, 0].map((index) => ({
      index,
      text: formatValue((value >>> (8 * index)) & 0xff, 1, radix),
      changed: changedByByte[index],
    }));
    return {
      name: set.names.E,
      set,
      text: formatValue(value, 4, radix),
      changed: dirtyE || dirtyL || dirtyH,
      bytes,
      x: set.names.X,
      h: set.names.H,
      l: set.names.L,
    };
  });
}

/**
 * Writes an edited register field (`RegisterPanel.edit`): the collapsed field
 * (`byteIndex` null) replaces the whole 32-bit register, a byte field only that
 * byte. Returns false and changes nothing for invalid text. Like every UI edit
 * it does not advance the change counter.
 */
export function writeRegister(
  dsp: DataSpace,
  set: RegisterSet,
  text: string,
  radix: Radix,
  byteIndex: number | null,
): boolean {
  const parsed = parseValue(text, radix);
  if (parsed === null) return false;
  let value = parsed;
  if (byteIndex !== null) {
    const shift = BigInt(8 * byteIndex);
    const mask = 0xffn << shift;
    const current = BigInt(dsp.registers.get(set.E));
    value = (current & ~mask) | ((parsed << shift) & mask);
  }
  dsp.put(value, set.E, null);
  return true;
}
