import { Address, MemCellInfo } from './address';
import { EVEN_PARITY, Flag } from './flags';
import { Fpu } from './fpu';
import {
  byte,
  doubleToLongBits,
  floatToIntBits,
  int,
  long,
  parseJavaDouble,
  parseLong,
  short,
  sizeMask,
  TWO_32,
} from './java';
import { Memory } from './memory';
import { Op, matches } from './op';
import { ALL_REGISTER_NAMES, RegisterFile, registerAddress } from './registers';

/** Resolves a label name to the line that defines it, or -1 (the document in the original). */
export interface LabelSource {
  getLabelLine(label: string): number;
}

export const PREFIXES = ['REP', 'REPE', 'REPZ', 'REPNE', 'REPNZ'] as const;
export const PREFIX_PATTERN = /^(REP|REPE|REPZ|REPNE|REPNZ)$/;

/** Groups the four views of one 32-bit register, for the registers panel. */
export interface RegisterSet {
  readonly L: Address | null;
  readonly H: Address | null;
  readonly X: Address | null;
  readonly E: Address;
  readonly names: { L: string; H: string; X: string; E: string };
}

export type FlagState = Record<'CF' | 'OF' | 'SF' | 'ZF' | 'PF' | 'AF' | 'TF' | 'DF', boolean>;

/**
 * The machine of one document: memory, registers, flags, variables, constants and
 * FPU (port of `jasmin.core.DataSpace`, spec 04).
 */
export class DataSpace {
  readonly fpu = new Fpu();
  labels: LabelSource = { getLabelLine: () => -1 };

  readonly memorySize: number;
  readonly offset: number;
  /** End of memory: initial ESP and EBP, and the upper bound of the stack (07 Q-S-1). */
  readonly memoryEnd: number;
  readonly memory: Memory;
  readonly registers = new RegisterFile();
  private readonly registerTable = new Map<string, Address>();
  private memInfo = new Map<number, MemCellInfo>();
  private regInfo = new Map<number, MemCellInfo>();
  private nextReservableAddress: number;
  private outOfRange = false;
  /** Set by JASMINSLEEP: milliseconds the run loop should wait before the next line. */
  pendingSleepMs = 0;
  private variables = new Map<string, number>();
  private constants = new Map<string, bigint>();

  // Flags. CF, OF, SF, ZF, PF and AF may be pending (`lazyFlags`): then they are
  // computed from the last arithmetic operation recorded by `setFlagsLazy` when
  // first read. Every read goes through the accessors below, so it always sees the
  // value an eager computation would have stored.
  private cf = false;
  private of = false;
  private sf = false;
  private zf = false;
  private pf = false;
  private af = false;
  fTrap = false;
  fDirection = false;
  /** `Flag` bits still to be computed from the operation below. */
  private lazyFlags = 0;
  private lazySize = 4;
  private lazyA = 0;
  private lazyB = 0;
  private lazyResult = 0;
  private lazySubtrahend = 0;

  readonly EAX: Address;
  readonly AX: Address;
  readonly AH: Address;
  readonly AL: Address;
  readonly EBX: Address;
  readonly BX: Address;
  readonly BH: Address;
  readonly BL: Address;
  readonly ECX: Address;
  readonly CX: Address;
  readonly CH: Address;
  readonly CL: Address;
  readonly EDX: Address;
  readonly DX: Address;
  readonly DH: Address;
  readonly DL: Address;
  readonly ESI: Address;
  readonly SI: Address;
  readonly EDI: Address;
  readonly DI: Address;
  readonly ESP: Address;
  readonly SP: Address;
  readonly EBP: Address;
  readonly BP: Address;
  readonly EIP: Address;
  readonly registerSets: readonly RegisterSet[];

  /** `size` is rounded up to a multiple of 4 (spec 04 §1). */
  constructor(size: number, startAddress: number) {
    this.memorySize = size + 3 - ((size + 3) % 4);
    this.offset = startAddress;
    this.memoryEnd = this.memorySize + startAddress;
    this.memory = new Memory(this.memorySize, startAddress);
    this.nextReservableAddress = startAddress;
    for (const name of ALL_REGISTER_NAMES) this.registerTable.set(name, registerAddress(name));
    const r = (name: string) => this.registerTable.get(name)!;
    this.EAX = r('EAX');
    this.AX = r('AX');
    this.AH = r('AH');
    this.AL = r('AL');
    this.EBX = r('EBX');
    this.BX = r('BX');
    this.BH = r('BH');
    this.BL = r('BL');
    this.ECX = r('ECX');
    this.CX = r('CX');
    this.CH = r('CH');
    this.CL = r('CL');
    this.EDX = r('EDX');
    this.DX = r('DX');
    this.DH = r('DH');
    this.DL = r('DL');
    this.ESI = r('ESI');
    this.SI = r('SI');
    this.EDI = r('EDI');
    this.DI = r('DI');
    this.ESP = r('ESP');
    this.SP = r('SP');
    this.EBP = r('EBP');
    this.BP = r('BP');
    this.EIP = r('EIP');
    const set = (L: string, H: string, X: string, E: string): RegisterSet => ({
      L: L ? r(L) : null,
      H: H ? r(H) : null,
      X: X ? r(X) : null,
      E: r(E),
      names: { L, H, X, E },
    });
    this.registerSets = [
      set('AL', 'AH', 'AX', 'EAX'),
      set('BL', 'BH', 'BX', 'EBX'),
      set('CL', 'CH', 'CX', 'ECX'),
      set('DL', 'DH', 'DX', 'EDX'),
      set('', '', 'SI', 'ESI'),
      set('', '', 'DI', 'EDI'),
      set('', '', 'SP', 'ESP'),
      set('', '', 'BP', 'EBP'),
      set('', '', '', 'EIP'),
    ];
    this.resetStackRegisters();
  }

  private resetStackRegisters(): void {
    this.putNum(this.memoryEnd, this.ESP, null);
    this.putNum(this.memoryEnd, this.EBP, null);
    this.registers.clearDirty();
  }

  // ---- out-of-range flag (runtime errors) ----

  addressOutOfRange(): boolean {
    return this.outOfRange;
  }

  setAddressOutOfRange(): void {
    this.outOfRange = true;
  }

  clearAddressOutOfRange(): void {
    this.outOfRange = false;
  }

  // ---- instruction pointer (a line number) ----

  getInstructionPointer(): number {
    return this.registers.get(this.EIP) | 0;
  }

  setInstructionPointer(ip: number): void {
    this.registers.setNum(this.EIP, ip);
  }

  // ---- registers ----

  getRegisterArgument(name: string): Address | undefined {
    return this.registerTable.get(name);
  }

  getRegisterSize(name: string): number {
    return this.registerTable.get(name)?.size ?? 0;
  }

  /** The register of the same family with the given size, e.g. (EAX, 2) -> AX. */
  getMatchingRegister(big: Address, size: number): Address | null {
    for (const rs of this.registerSets) {
      if (rs.E === big) {
        if (size === 1) return rs.L;
        if (size === 2) return rs.X;
        if (size === 4) return rs.E;
      }
    }
    return null;
  }

  /** The current stack top as a memory operand of `size` bytes. */
  stack(size: number): Address {
    return new Address(Op.MEM, size, this.registers.get(this.ESP) | 0);
  }

  /** ESP as a number (`shortcut(ESP)`). */
  get esp(): number {
    return this.registers.get(this.ESP);
  }

  // ---- flags ----

  get fCarry(): boolean {
    if (this.lazyFlags & Flag.CF) this.materializeFlags(Flag.CF);
    return this.cf;
  }

  set fCarry(value: boolean) {
    this.cf = value;
    this.lazyFlags &= ~Flag.CF;
  }

  get fOverflow(): boolean {
    if (this.lazyFlags & Flag.OF) this.materializeFlags(Flag.OF);
    return this.of;
  }

  set fOverflow(value: boolean) {
    this.of = value;
    this.lazyFlags &= ~Flag.OF;
  }

  get fSign(): boolean {
    if (this.lazyFlags & Flag.SF) this.materializeFlags(Flag.SF);
    return this.sf;
  }

  set fSign(value: boolean) {
    this.sf = value;
    this.lazyFlags &= ~Flag.SF;
  }

  get fZero(): boolean {
    if (this.lazyFlags & Flag.ZF) this.materializeFlags(Flag.ZF);
    return this.zf;
  }

  set fZero(value: boolean) {
    this.zf = value;
    this.lazyFlags &= ~Flag.ZF;
  }

  get fParity(): boolean {
    if (this.lazyFlags & Flag.PF) this.materializeFlags(Flag.PF);
    return this.pf;
  }

  set fParity(value: boolean) {
    this.pf = value;
    this.lazyFlags &= ~Flag.PF;
  }

  get fAuxiliary(): boolean {
    if (this.lazyFlags & Flag.AF) this.materializeFlags(Flag.AF);
    return this.af;
  }

  set fAuxiliary(value: boolean) {
    this.af = value;
    this.lazyFlags &= ~Flag.AF;
  }

  /**
   * Records an operation of `size` <= 4 bytes that sets the `flags` (`Flag` bits)
   * as `JasminCommand.setFlags` does; they are computed when first read. `a`, `b`
   * and `result` are the Java long values as exact integers (|value| < 2^53), or
   * any integers with the same bits 0..32. For subtraction `b` is the negated
   * subtrahend and `subtrahend` the original one (AF, 07 Q-F-1); otherwise both are
   * the second operand. Flags still pending from the previous operation that this
   * one does not set are computed first (INC keeps CF, shifts keep AF, ...).
   */
  setFlagsLazy(
    size: number,
    flags: number,
    a: number,
    b: number,
    result: number,
    subtrahend: number,
  ): void {
    const kept = this.lazyFlags & ~flags;
    if (kept !== 0) this.materializeFlags(kept);
    this.lazySize = size;
    this.lazyA = a;
    this.lazyB = b;
    this.lazyResult = result;
    this.lazySubtrahend = subtrahend;
    this.lazyFlags = flags;
  }

  /** Computes the pending flags among `flags` (all pending ones by default). */
  materializeFlags(flags = this.lazyFlags): void {
    const pending = flags & this.lazyFlags;
    if (pending === 0) return;
    this.lazyFlags &= ~pending;
    const bits = this.lazySize * 8;
    const signShift = bits - 1;
    const result = this.lazyResult;
    if (pending & Flag.ZF) {
      this.zf = (bits === 32 ? result | 0 : result & ((1 << bits) - 1)) === 0;
    }
    if (pending & Flag.SF) this.sf = ((result >> signShift) & 1) === 1;
    if (pending & Flag.PF) this.pf = EVEN_PARITY[result & 0xff] === 1;
    if (pending & Flag.CF) {
      // Bit `bits` of the result: carry (or borrow) out of the operand.
      this.cf = (bits === 32 ? Math.floor(result / TWO_32) & 1 : (result >> bits) & 1) === 1;
    }
    if (pending & Flag.OF) {
      const aSign = (this.lazyA >> signShift) & 1;
      const bSign = (this.lazyB >> signShift) & 1;
      const resultSign = (result >> signShift) & 1;
      this.of = aSign === bSign && resultSign !== aSign;
    }
    if (pending & Flag.AF) {
      // Carry or borrow out of bit 3 (07 Q-F-1): bit 4 of a ^ b ^ result.
      this.af = ((this.lazyA ^ this.lazySubtrahend ^ result) & 0x10) !== 0;
    }
  }

  get flags(): FlagState {
    return {
      CF: this.fCarry,
      OF: this.fOverflow,
      SF: this.fSign,
      ZF: this.fZero,
      PF: this.fParity,
      AF: this.fAuxiliary,
      TF: this.fTrap,
      DF: this.fDirection,
    };
  }

  setFlags(flags: FlagState): void {
    this.fCarry = flags.CF;
    this.fOverflow = flags.OF;
    this.fSign = flags.SF;
    this.fZero = flags.ZF;
    this.fParity = flags.PF;
    this.fAuxiliary = flags.AF;
    this.fTrap = flags.TF;
    this.fDirection = flags.DF;
  }

  // ---- writes ----
  //
  // Values are Java longs. Operands of up to 4 bytes only keep the low 32 bits, so
  // they are written from numbers (`putNum`); bigints remain for 8-byte memory and
  // FPU registers.

  private putInteger(value: bigint, a: Address): void {
    if (a.type & Op.REG || a.size <= 4) {
      this.putIntegerNum(Number(BigInt.asUintN(32, value)), a);
    } else if (a.type & Op.MEM) {
      if (a.address < this.offset || a.address + a.size > this.memoryEnd) {
        this.outOfRange = true;
        return;
      }
      let v = BigInt.asUintN(64, value);
      for (let i = 0; i < a.size; i++) {
        this.memory.set(a.address + i, Number(v & 0xffn));
        v >>= 8n;
      }
    }
  }

  /**
   * Writes the low `a.size` bytes of the integer `value` (exact, |value| < 2^53)
   * to a register or memory. Bytes above the fourth come from the high half, so
   * 8-byte cells get the sign extension of small negative values.
   */
  private putIntegerNum(value: number, a: Address): void {
    if (a.type & Op.REG) {
      this.registers.setNum(a, value);
    } else if (a.type & Op.MEM) {
      const address = a.address;
      const size = a.size;
      if (address < this.offset || address + size > this.memoryEnd) {
        this.outOfRange = true;
        return;
      }
      if (size <= 4) {
        this.memory.setLittleEndian(address, value, size);
      } else {
        this.memory.setLittleEndian(address, value, 4);
        this.memory.setLittleEndian(address + 4, Math.floor(value / TWO_32), size - 4);
      }
    }
  }

  /** Stores a value in a register, memory or FPU register (`DataSpace.put`). */
  put(value: bigint, a: Address | null | undefined, info: MemCellInfo | null): void {
    if (!a) return;
    if (a.type & (Op.MEM | Op.REG)) {
      this.putInteger(value, a);
      this.setMemInfo(a, info);
      return;
    }
    if (a.type & Op.FPUREG) this.fpu.putBits(a, value);
  }

  /** `put` of an exact integer number (|value| < 2^53), e.g. a 32-bit result. */
  putNum(value: number, a: Address | null | undefined, info: MemCellInfo | null): void {
    if (!a) return;
    if (a.type & (Op.MEM | Op.REG)) {
      this.putIntegerNum(value, a);
      this.setMemInfo(a, info);
      return;
    }
    if (a.type & Op.FPUREG) this.fpu.putBits(a, BigInt(value));
  }

  private setMemInfo(a: Address, info: MemCellInfo | null): void {
    if (info !== null) this.memInfoPut(a, info);
    else if (a.type & Op.REG ? this.regInfo.size !== 0 : this.memInfo.size !== 0) {
      this.memInfoDelete(a);
    }
  }

  // ---- reads ----

  getUnsignedMemory(address: number, size: number): bigint {
    let result = 0n;
    for (let i = size - 1; i >= 0; i--)
      result = (result << 8n) | BigInt(this.memory.get(address + i));
    return long(result);
  }

  getSignedMemory(address: number, size: number): bigint {
    const unsigned = this.getUnsignedMemory(address, size);
    if (size === 8) return unsigned;
    if (size === 4) return int(unsigned);
    if (size === 2) return short(unsigned);
    if (size === 1) return byte(unsigned);
    throw new Error('getSignedMemory called with invalid size!');
  }

  private getSignedRegister(a: Address): bigint {
    const value = BigInt(this.registers.get(a));
    if (a.size === 8) return value;
    if (a.size === 4) return int(value);
    if (a.size === 2) return short(value);
    if (a.size === 1) return byte(value);
    throw new Error('getSignedRegister called with invalid size');
  }

  /** Reads a register, memory or FPU operand (`DataSpace.getUpdate`). */
  getUpdate(a: Address | null | undefined, signed: boolean): bigint {
    if (!a) return 0n;
    if (a.type & Op.MEM) {
      if (a.address < this.offset || a.address + a.size > this.memoryEnd) {
        this.outOfRange = true;
        return 0n;
      }
      const info = this.memInfo.get(a.address);
      if (info && info.type === Op.LABEL) {
        const current = this.labelValue(info.value);
        if (current !== this.getUnsignedMemory(a.address, a.size)) this.put(current, a, info);
        return current;
      }
      return signed
        ? this.getSignedMemory(a.address, a.size)
        : this.getUnsignedMemory(a.address, a.size);
    }
    if (a.type & Op.REG) {
      const info = this.regInfo.get(a.address);
      if (info && info.type === Op.LABEL) {
        const current = this.labelValue(info.value);
        if (current !== BigInt(this.registers.get(a))) this.put(current, a, info);
        return current;
      }
      return signed ? this.getSignedRegister(a) : BigInt(this.registers.get(a));
    }
    if (a.type & Op.FPUREG) return this.fpu.getBits(a);
    return a.value;
  }

  /**
   * `getUpdate` as a number, for operands of at most 4 bytes and static values
   * that are small numbers (`Address.num`). Not for 8-byte memory or FPU registers.
   */
  getUpdateNum(a: Address | null | undefined, signed: boolean): number {
    if (!a) return 0;
    if (a.type & Op.MEM) {
      const address = a.address;
      const size = a.size;
      if (address < this.offset || address + size > this.memoryEnd) {
        this.outOfRange = true;
        return 0;
      }
      if (this.memInfo.size !== 0) {
        const info = this.memInfo.get(address);
        if (info && info.type === Op.LABEL) {
          const current = this.labels.getLabelLine(info.value);
          if (current !== this.getUnsignedMemoryNum(address, size)) this.putNum(current, a, info);
          return current;
        }
      }
      return signed
        ? this.getSignedMemoryNum(address, size)
        : this.getUnsignedMemoryNum(address, size);
    }
    if (a.type & Op.REG) {
      if (this.regInfo.size !== 0) {
        const info = this.regInfo.get(a.address);
        if (info && info.type === Op.LABEL) {
          const current = this.labels.getLabelLine(info.value);
          if (current !== this.registers.get(a)) this.putNum(current, a, info);
          return current;
        }
      }
      return signed ? this.getSignedRegisterNum(a) : this.registers.get(a);
    }
    return a.num;
  }

  /** Unsigned little-endian value of 1, 2 or 4 bytes. */
  private getUnsignedMemoryNum(address: number, size: number): number {
    const bytes = this.memory.bytes;
    const i = address - this.offset;
    if (size === 4) {
      return (bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24)) >>> 0;
    }
    if (size === 2) return bytes[i] | (bytes[i + 1] << 8);
    if (size === 1) return bytes[i];
    let result = 0;
    for (let k = size - 1; k >= 0; k--) result = result * 256 + bytes[i + k];
    return result;
  }

  private getSignedMemoryNum(address: number, size: number): number {
    const unsigned = this.getUnsignedMemoryNum(address, size);
    if (size === 4) return unsigned | 0;
    if (size === 2) return (unsigned << 16) >> 16;
    if (size === 1) return (unsigned << 24) >> 24;
    throw new Error('getSignedMemory called with invalid size!');
  }

  /** Signed value of a register of the given part's size. */
  getSignedRegisterNum(a: Address): number {
    const value = this.registers.get(a);
    if (a.size === 4) return value | 0;
    if (a.size === 2) return (value << 16) >> 16;
    if (a.size === 1) return (value << 24) >> 24;
    throw new Error('getSignedRegister called with invalid size');
  }

  /** Unsigned value of a register (`Address.getShortcut`). */
  shortcut(a: Address): bigint {
    return BigInt(this.registers.get(a));
  }

  private labelValue(label: string): bigint {
    return BigInt(this.labels.getLabelLine(label));
  }

  /** Value of a static operand: immediate, short string, label, variable, constant, float. */
  getInitial(src: string, type: number, size: number, signed: boolean): bigint {
    if (type & Op.IMM) {
      const value = parseLong(src);
      return signed ? value : long(value & sizeMask(size));
    }
    if (type === Op.CHARS) return charsAsNumber(src);
    if (type === Op.LABEL) return this.labelValue(src);
    if (type === Op.VARIABLE) return BigInt(this.getVariable(src));
    if (type === Op.CONST) return this.getConstant(src);
    if (type === Op.FLOAT) {
      if (size === 8) return doubleToLongBits(parseJavaDouble(src));
      if (size === 4) return floatToIntBits(Math.fround(parseJavaDouble(src)));
    }
    return 0n;
  }

  // ---- label markers (memory cells and registers holding a label's line) ----

  memInfoOf(a: Address): MemCellInfo | null {
    if (matches(a.type, Op.MEM)) return this.memInfo.get(a.address) ?? null;
    if (matches(a.type, Op.REG)) return this.regInfo.get(a.address) ?? null;
    return null;
  }

  private memInfoPut(a: Address, info: MemCellInfo): void {
    if (matches(a.type, Op.MEM)) {
      if (a.address >= this.memoryEnd || a.address < this.offset) return;
      this.memInfo.set(a.address, info);
    } else if (matches(a.type, Op.REG)) {
      this.regInfo.set(a.address, info);
    }
  }

  private memInfoDelete(a: Address): void {
    if (matches(a.type, Op.MEM)) {
      if (a.address >= this.memoryEnd || a.address < this.offset) return;
      this.memInfo.delete(a.address);
    } else if (matches(a.type, Op.REG)) {
      this.regInfo.delete(a.address);
    }
  }

  /** Label markers keyed by memory address and by register index (for snapshots). */
  getLabelCells(): { memory: Map<number, MemCellInfo>; registers: Map<number, MemCellInfo> } {
    return { memory: new Map(this.memInfo), registers: new Map(this.regInfo) };
  }

  setLabelCells(memory: Map<number, MemCellInfo>, registers: Map<number, MemCellInfo>): void {
    this.memInfo = new Map(memory);
    this.regInfo = new Map(registers);
  }

  // ---- change tracking ----

  updateDirty(): void {
    this.memory.updateDirty();
    this.registers.updateDirty();
  }

  setDirty(a: Address): void {
    if (a.type & Op.REG) this.registers.setDirty(a);
    else if (a.type & Op.MEM) for (let i = 0; i < a.size; i++) this.memory.setDirty(a.address + i);
  }

  isDirty(a: Address, steps: number): boolean {
    if (a.type & Op.MEM) {
      for (let i = 0; i < a.size; i++) if (this.memory.isDirty(a.address + i, steps)) return true;
      return false;
    }
    if (a.type & Op.REG) return this.registers.isDirty(a, steps);
    return false;
  }

  // ---- reset ----

  /** Clears flags, memory, variables, constants, registers and FPU (`DataSpace.clear`). */
  clear(): void {
    this.fCarry = this.fOverflow = this.fSign = this.fZero = false;
    this.fParity = this.fAuxiliary = this.fTrap = this.fDirection = false;
    this.memory.reset();
    this.memInfo = new Map();
    this.nextReservableAddress = this.offset;
    this.variables.clear();
    this.constants.clear();
    this.outOfRange = false;
    this.registers.reset();
    this.regInfo = new Map();
    this.resetStackRegisters();
    this.fpu.clear();
  }

  // ---- data allocation, variables and constants (spec 04 §5) ----

  /** Reserves `howMany` blocks of `size` bytes; null (and the out-of-range flag) if memory is full. */
  malloc(size: number, howMany: number): Address | null {
    const result = this.nextReservableAddress;
    this.nextReservableAddress += size * howMany;
    if (this.nextReservableAddress > this.memoryEnd) {
      this.outOfRange = true;
      return null;
    }
    return new Address(Op.MEM, size, result);
  }

  get nextFree(): number {
    return this.nextReservableAddress;
  }

  set nextFree(address: number) {
    this.nextReservableAddress = address;
  }

  /** Replaces all variables and constants (snapshots, spec 04 §9.10). */
  setSymbols(variables: Map<string, number>, constants: Map<string, bigint>): void {
    this.variables = new Map(variables);
    this.constants = new Map(constants);
  }

  registerVariable(label: string): void {
    if (!this.variables.has(label)) this.variables.set(label, this.nextReservableAddress);
    this.constants.delete(label);
  }

  setVariableAddress(variable: string, address: number): void {
    this.variables.set(variable, address);
  }

  registerConstant(label: string): void {
    if (!this.constants.has(label)) this.constants.set(label, 0n);
    this.variables.delete(label);
  }

  setConstantValue(label: string, value: bigint): void {
    this.constants.set(label, value);
    this.variables.delete(label);
  }

  unregisterVariable(label: string | null): void {
    if (label !== null) this.variables.delete(label);
  }

  unregisterConstant(label: string | null): void {
    if (label !== null) this.constants.delete(label);
  }

  getVariable(name: string): number {
    return this.variables.get(name) ?? 0;
  }

  getConstant(name: string): bigint {
    return this.constants.get(name) ?? 0n;
  }

  getVariableList(): string[] {
    return [...this.variables.keys()];
  }

  getConstantList(): string[] {
    return [...this.constants.keys()];
  }

  isVariable(name: string): boolean {
    return this.variables.has(name);
  }

  isConstant(name: string): boolean {
    return this.constants.has(name);
  }
}

/** `Parser.getCharsAsNumber`: packs up to four characters little-endian. */
export function charsAsNumber(chars: string): bigint {
  const text = chars.replace(/'/g, '');
  let result = 0;
  for (let i = 0; i < text.length; i++) result |= text.charCodeAt(i) << (8 * i);
  return BigInt(result);
}
