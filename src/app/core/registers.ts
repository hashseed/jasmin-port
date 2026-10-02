import { Address } from './address';
import { Op } from './op';

/** Register names in parser order (`DataSpace.registers`). */
export const ALL_REGISTER_NAMES = [
  'EAX',
  'AX',
  'AL',
  'AH',
  'EBX',
  'BX',
  'BL',
  'BH',
  'ECX',
  'CX',
  'CL',
  'CH',
  'EDX',
  'DX',
  'DL',
  'DH',
  'ESI',
  'SI',
  'EDI',
  'DI',
  'ESP',
  'SP',
  'EBP',
  'BP',
  'EIP',
] as const;

/** Index of each 32-bit register in the register file. */
export const REGISTER_INDEX = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
  SI: 4,
  DI: 5,
  SP: 6,
  BP: 7,
  IP: 8,
} as const;

/** Which parts of a register a write touched (spec 04 §8). */
export const RegisterPart = { L: 0b0001, H: 0b0010, X: 0b0011, E: 0b1111 } as const;

function registerIndex(name: string): number {
  if (/^.?A.$/.test(name)) return 0;
  if (/^E?B[HLX]$/.test(name)) return 1;
  if (/^E?C.$/.test(name)) return 2;
  if (/^E?D[HLX]$/.test(name)) return 3;
  if (/^E?SI$/.test(name)) return 4;
  if (/^E?DI$/.test(name)) return 5;
  if (/^E?SP$/.test(name)) return 6;
  if (/^E?BP$/.test(name)) return 7;
  return 8;
}

/** Builds the Address object for a register name (port of `Registers.constructAddress`). */
export function registerAddress(name: string): Address {
  const a = new Address(Op.REG, 0, registerIndex(name));
  if (/^E..$/.test(name)) {
    a.type = Op.R32;
    a.size = 4;
    a.mask = 0xffffffff;
  } else if (/^.[XIP]$/.test(name)) {
    a.type = Op.R16;
    a.size = 2;
    a.mask = 0xffff;
  } else if (/^.H$/.test(name)) {
    a.type = Op.R8;
    a.size = 1;
    a.mask = 0xff00;
    a.rshift = 8;
  } else if (/^.L$/.test(name)) {
    a.type = Op.R8;
    a.size = 1;
    a.mask = 0xff;
  }
  return a;
}

/** The part of the register an address refers to. */
export function registerPart(a: Address): number {
  if (a.type === Op.R8) return a.rshift === 0 ? RegisterPart.L : RegisterPart.H;
  if (a.type === Op.R16) return RegisterPart.X;
  if (a.type === Op.R32) return RegisterPart.E;
  return 0;
}

const NEVER = Number.MIN_SAFE_INTEGER;
const IP = REGISTER_INDEX.IP;

/**
 * The nine 32-bit registers with per-register change stamps (port of `Registers`).
 * A write stamps its register with the change counter and remembers which part it
 * wrote as that part's `mask` (spec 04 §8): the masks of L, H, X and E contain one
 * another exactly as the parts do, so `isDirty` can compare them like the parts.
 */
export class RegisterFile {
  readonly values = new Uint32Array(9);
  private readonly dirty = new Float64Array(9).fill(NEVER);
  /** Mask (as int32) of the part last written, 0 if none. */
  private readonly dirtyMask = new Int32Array(9);
  private stamp = 0;

  /** Unsigned value of the addressed part. */
  get(a: Address): number {
    return ((this.values[a.address] & a.mask) >>> a.rshift) >>> 0;
  }

  set(a: Address, value: bigint): void {
    this.setNum(a, Number(BigInt.asUintN(32, value)));
  }

  /**
   * Stores the low bits of an integer `value` (any exact integer: the shift
   * converts it to its low 32 bits, as the bigint version masks them).
   */
  setNum(a: Address, value: number): void {
    const index = a.address;
    const mask = a.mask;
    this.values[index] = (this.values[index] & ~mask) | ((value << a.rshift) & mask);
    this.dirty[index] = this.stamp;
    this.dirtyMask[index] = mask;
  }

  /** EIP as a signed number (a line number). */
  get instructionPointer(): number {
    return this.values[IP] | 0;
  }

  /** `setNum(EIP, ip)` for an integer `ip`. */
  setInstructionPointer(ip: number): void {
    this.values[IP] = ip;
    this.dirty[IP] = this.stamp;
    this.dirtyMask[IP] = -1;
  }

  reset(): void {
    this.values.fill(0);
    this.clearDirty();
  }

  setDirty(a: Address): void {
    this.dirty[a.address] = this.stamp;
  }

  isDirty(a: Address, steps: number): boolean {
    if (this.stamp - this.dirty[a.address] > steps) return false;
    const mask = a.mask | 0;
    return registerPart(a) !== 0 && (this.dirtyMask[a.address] & mask) === mask;
  }

  updateDirty(): void {
    this.stamp++;
  }

  clearDirty(): void {
    this.stamp = 0;
    this.dirty.fill(NEVER);
  }
}
