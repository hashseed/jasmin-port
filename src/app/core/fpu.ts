import { Address } from './address';
import { doubleToLong, doubleToLongBits, long, longBitsToDouble, parseJavaDouble } from './java';
import { formatJavaDouble } from './java-double';

export const FpuTag = { VALID: 0, ZERO: 1, SPECIAL: 2, EMPTY: 3 } as const;

const NUM_REGISTERS = 8;

export const FPU_REGISTER_PATTERN = /^(ST0|ST1|ST2|ST3|ST4|ST5|ST6|ST7)$/;
export const FPU_QUALIFIER_PATTERN = /^TO$/;

function tagOf(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return FpuTag.SPECIAL;
  if (value === 0) return FpuTag.ZERO;
  return FpuTag.VALID;
}

/** Status flags of the x87 status word. */
export interface FpuStatus {
  C0: boolean;
  C1: boolean;
  C2: boolean;
  C3: boolean;
  IE: boolean;
  DE: boolean;
  ZE: boolean;
  OE: boolean;
  UE: boolean;
  PE: boolean;
  SF: boolean;
}

const clearStatus = (): FpuStatus => ({
  C0: false,
  C1: false,
  C2: false,
  C3: false,
  IE: false,
  DE: false,
  ZE: false,
  OE: false,
  UE: false,
  PE: false,
  SF: false,
});

/** The x87 register stack: eight doubles with tags, TOP and status flags (port of `Fpu`, spec 04 §7). */
export class Fpu {
  registers = new Float64Array(NUM_REGISTERS);
  tags = new Uint8Array(NUM_REGISTERS).fill(FpuTag.EMPTY);
  top = 0;
  status: FpuStatus = clearStatus();
  private readonly listeners = new Set<() => void>();

  clear(): void {
    this.registers = new Float64Array(NUM_REGISTERS);
    this.tags = new Uint8Array(NUM_REGISTERS).fill(FpuTag.EMPTY);
    this.status = clearStatus();
    this.top = 0;
  }

  /** Physical register `R_i` as text, for the FPU table and the headless dump. */
  getRegisterContent(index: number): string {
    return formatJavaDouble(this.registers[index]);
  }

  /** Writes text parsed as a double into `R_i`; returns false (and changes nothing) if invalid. */
  putRegisterContent(index: number, content: string): boolean {
    const value = parseJavaDouble(content);
    if (Number.isNaN(value) && !/NaN/.test(content)) return false;
    this.registers[index] = value;
    return true;
  }

  /** `ST<k>` name of physical register `R_i`. */
  getRegisterName(index: number): string {
    return `ST${(index - this.top + NUM_REGISTERS) % NUM_REGISTERS}`;
  }

  getStatusWord(): bigint {
    const s = this.status;
    let word = 0;
    if (s.IE) word |= 1;
    if (s.DE) word |= 2;
    if (s.ZE) word |= 4;
    if (s.OE) word |= 8;
    if (s.UE) word |= 16;
    if (s.PE) word |= 32;
    if (s.SF) word |= 64;
    if (s.C0) word |= 256;
    if (s.C1) word |= 512;
    if (s.C2) word |= 1024;
    word |= this.top << 11;
    if (s.C3) word |= 16384;
    return BigInt(word);
  }

  putStatusWord(statusWord: bigint): void {
    const w = Number(BigInt.asUintN(32, statusWord));
    const s = this.status;
    s.IE = (w & 1) !== 0;
    s.DE = (w & 2) !== 0;
    s.ZE = (w & 4) !== 0;
    s.OE = (w & 8) !== 0;
    s.UE = (w & 16) !== 0;
    s.PE = (w & 32) !== 0;
    s.SF = (w & 64) !== 0;
    s.C0 = (w & 256) !== 0;
    s.C1 = (w & 512) !== 0;
    s.C2 = (w & 1024) !== 0;
    this.top = (w >> 11) & 7;
    s.C3 = (w & 16384) !== 0;
  }

  getTagWord(): bigint {
    let word = 0n;
    for (let i = 0; i < NUM_REGISTERS; i++) {
      word = (word << 2n) | BigInt(this.tags[NUM_REGISTERS - 1 - i]);
    }
    return word;
  }

  putTagWord(word: bigint): void {
    let w = word;
    for (let i = 0; i < NUM_REGISTERS; i++) {
      this.tags[i] = Number(w & 3n);
      w >>= 2n;
    }
  }

  private setStackOverflow(): void {
    this.status.IE = true;
    this.status.SF = true;
    this.status.C1 = true;
  }

  private setStackUnderflow(): void {
    this.status.IE = true;
    this.status.SF = true;
    this.status.C1 = false;
  }

  push(value: number): void {
    this.top = (this.top + NUM_REGISTERS - 1) % NUM_REGISTERS;
    if (this.tags[this.top] !== FpuTag.EMPTY) this.setStackOverflow();
    this.registers[this.top] = value;
    this.tags[this.top] = tagOf(value);
    this.notify();
  }

  pop(): number {
    if (this.tags[this.top] === FpuTag.EMPTY) this.setStackUnderflow();
    const value = this.registers[this.top];
    this.tags[this.top] = FpuTag.EMPTY;
    this.top = (this.top + 1) % NUM_REGISTERS;
    this.notify();
    return value;
  }

  /** Writes `ST(i)`. */
  put(relative: number, value: number): void {
    const position = (this.top + relative) % NUM_REGISTERS;
    this.registers[position] = value;
    this.tags[position] = tagOf(value);
    this.notify();
  }

  /** Reads `ST(i)`; wraps around the stack (07 Q-FPU-1). */
  get(relative: number): number {
    const position = (this.top + (relative % NUM_REGISTERS)) % NUM_REGISTERS;
    if (this.tags[position] === FpuTag.EMPTY) this.setStackUnderflow();
    return this.registers[position];
  }

  putBits(a: Address, bits: bigint): void {
    this.put(a.address, longBitsToDouble(bits));
  }

  getBits(a: Address): bigint {
    return doubleToLongBits(this.get(a.address));
  }

  /** Index of an `ST<n>` operand. */
  static getAddress(register: string): number {
    return Number(register.substring(2));
  }

  addListener(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** `Fpu.doubleFromLong`. */
export const doubleFromLong = (a: bigint): number => Number(a);

/** `Fpu.longFromPackedBCD`. */
export function longFromPackedBCD(a: bigint): bigint {
  let b = 0n;
  let counter = 0;
  let rest = a;
  while (rest > 0n) {
    // `(int) Math.pow(10, counter)` saturates at Integer.MAX_VALUE in Java.
    const power = Math.min(10 ** counter, 2147483647);
    b = long(b + (rest & 15n) * BigInt(power));
    rest >>= 4n;
    counter++;
  }
  return b;
}

export const doubleFromPackedBCD = (a: bigint): number => Number(longFromPackedBCD(a));

export const longFromDouble = (d: number): bigint => doubleToLong(d);

/** `Fpu.packedBCDFromLong`. */
export function packedBCDFromLong(a: bigint): bigint {
  let b = 0n;
  let counter = 0n;
  let rest = a;
  while (rest > 0n) {
    b = long(b | long((rest % 10n) << ((4n * counter) & 63n)));
    rest /= 10n;
    counter++;
  }
  return b;
}

export const packedBCDFromDouble = (d: number): bigint => packedBCDFromLong(doubleToLong(d));
