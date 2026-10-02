import { Address, FpuDataType, MemCellInfo } from './address';
import { DataSpace } from './data-space';
import { doubleFromLong, doubleFromPackedBCD, longFromDouble, packedBCDFromDouble } from './fpu';
import { FullArgument } from './full-argument';
import {
  byte,
  doubleToLongBits,
  floatToIntBits,
  int,
  intBitsToFloat,
  longBitsToDouble,
  short,
} from './java';
import { Op, matches, operandTypeErrorMessage } from './op';
import { ParseError } from './parse-error';
import { operandSize } from './operand-size';

/**
 * The operands of one instruction plus scratch values for executing it (port of
 * `jasmin.core.Parameters`). `a`, `b`, `c` and `result` are Java longs.
 */
export class Parameters {
  private args: (FullArgument | undefined)[] = [];
  private noArgument = new FullArgument('', '', 0, Op.NULL, -1, false, null);
  numArguments = 0;
  size = -1;
  defaultSize = 4;
  signed = false;
  wholeLine = '';
  mnemo = '';
  a = 0n;
  b = 0n;
  c = 0n;
  result = 0n;
  fa = 0;
  fb = 0;
  label: string | null = null;

  constructor(readonly dsp: DataSpace) {}

  argument(index: number): FullArgument {
    return index < this.numArguments ? (this.args[index] ?? this.noArgument) : this.noArgument;
  }

  set(
    wholeLine: string,
    mnemo: string,
    args: FullArgument[],
    defaultSize: number,
    signed: boolean,
  ): void {
    this.wholeLine = wholeLine;
    this.mnemo = mnemo;
    this.numArguments = args.length;
    this.args = [...args];
    this.defaultSize = defaultSize;
    this.signed = signed;
    this.size = Math.max(this.sizeOf(0), this.sizeOf(1));
    if (this.size === -1) this.size = defaultSize;
    for (const arg of args) {
      const a = arg.address;
      if (matches(a.type, Op.MU)) a.size = this.size;
      else if (matches(a.type, Op.FLOAT) && a.size === -1) a.size = this.size;
      if (a.dynamic) {
        arg.calculateAddress(this.dsp);
      } else {
        const previousSize = a.size;
        a.size = this.size;
        a.value = this.dsp.getInitial(arg.arg, a.type, a.size, signed);
        a.size = previousSize;
      }
    }
  }

  // ---- reading and writing operands ----

  getAddress(a: Address): bigint {
    if (a.dynamic) {
      if (a.type & Op.REG) {
        const value = this.dsp.shortcut(a);
        if (this.signed) {
          if (a.size === 1) return byte(value);
          if (a.size === 2) return short(value);
          if (a.size === 4) return int(value);
        }
        return value;
      }
      a.value = this.dsp.getUpdate(a, this.signed);
    }
    return a.value;
  }

  get(index: number): bigint {
    const arg = this.args[index];
    if (!arg || index >= this.numArguments) return 0n;
    if (!this.signed && arg.address.type & Op.REG) return this.dsp.shortcut(arg.address);
    if (arg.cAddress) arg.address.address = arg.cAddress.calculateEffectiveAddress(true);
    return this.getAddress(arg.address);
  }

  getF(index: number, dataType: number): number {
    const a = this.get(index);
    const type = this.argument(index).address.type;
    if (matches(type, Op.MEM)) {
      if (dataType === FpuDataType.FLOAT) {
        if (this.sizeOf(index) === 4) return intBitsToFloat(a);
        if (this.sizeOf(index) === 8) return longBitsToDouble(a);
      }
      if (dataType === FpuDataType.INTEGER) return doubleFromLong(a);
      if (dataType === FpuDataType.PACKED_BCD) return doubleFromPackedBCD(a);
    }
    if (matches(type, Op.FPUREG)) return longBitsToDouble(a);
    return 0;
  }

  putAddress(a: Address, value: bigint, info: MemCellInfo | null): void {
    if (a.dynamic) this.dsp.put(value, a, info);
  }

  put(index: number, value: bigint, info: MemCellInfo | null): void {
    this.putAddress(this.addressOf(index), value, info);
  }

  /**
   * Argument `index`'s address, with a memory operand's effective address computed
   * from the current registers. Run reuses parsed lines, so an address computed at
   * parse time would be stale (07 Q-I-18).
   */
  addressOf(index: number): Address {
    const arg = this.argument(index);
    if (arg.cAddress) arg.address.address = arg.cAddress.calculateEffectiveAddress(true);
    return arg.address;
  }

  putF(index: number, value: number, dataType: number): void {
    const arg = this.argument(index);
    this.addressOf(index);
    if (matches(arg.address.type, Op.MEM)) {
      if (dataType === FpuDataType.FLOAT) {
        let bits = 0n;
        if (this.sizeOf(index) === 4) bits = floatToIntBits(Math.fround(value));
        else if (this.sizeOf(index) === 8) bits = doubleToLongBits(value);
        this.dsp.put(bits, arg.address, null);
      } else if (dataType === FpuDataType.PACKED_BCD) {
        this.dsp.put(packedBCDFromDouble(value), arg.address, null);
      } else if (dataType === FpuDataType.INTEGER) {
        this.dsp.put(longFromDouble(value), arg.address, null);
      }
    } else if (matches(arg.address.type, Op.FPUREG)) {
      this.dsp.put(doubleToLongBits(value), arg.address, null);
    }
  }

  // ---- stack ----

  push(a: Address): void {
    const value = this.getAddress(a);
    this.dsp.put(this.dsp.shortcut(this.dsp.ESP) - BigInt(a.size), this.dsp.ESP, null);
    this.dsp.put(value, this.dsp.stack(a.size), this.dsp.memInfoOf(a));
  }

  /**
   * Pops `a.size` bytes into `a`. Popping above the top of memory is a stack
   * underflow, raised before anything is written (07 Q-S-1).
   */
  pop(a: Address): void {
    const newESP = this.dsp.shortcut(this.dsp.ESP) + BigInt(a.size);
    if (newESP > BigInt(this.dsp.memoryEnd)) {
      this.dsp.setAddressOutOfRange();
      return;
    }
    const stack = this.dsp.stack(a.size);
    this.dsp.put(this.dsp.getUpdate(stack, false), a, this.dsp.memInfoOf(stack));
    this.dsp.put(newESP, this.dsp.ESP, null);
  }

  /** Pops `size` bytes and returns them; a stack underflow (07 Q-S-1) returns 0 and changes nothing. */
  popValue(size: number): bigint {
    const newESP = this.dsp.shortcut(this.dsp.ESP) + BigInt(size);
    if (newESP > BigInt(this.dsp.memoryEnd)) {
      this.dsp.setAddressOutOfRange();
      return 0n;
    }
    const stack = this.dsp.stack(size);
    this.dsp.put(newESP, this.dsp.ESP, null);
    return this.dsp.getUpdate(stack, false);
  }

  // ---- operand accessors ----

  arg(index: number): string {
    return this.argument(index).arg;
  }

  originalArg(index: number): string {
    return this.argument(index).original;
  }

  startPos(index: number): number {
    return this.argument(index).startPos;
  }

  sizeOf(index: number): number {
    return this.argument(index).address.size;
  }

  type(index: number): number {
    return this.argument(index).address.type;
  }

  // ---- validation helpers used by the instructions ----

  error(index: number, message: string): ParseError {
    return ParseError.forArgument(this.wholeLine, this.argument(index), message);
  }

  consistentSizes(): ParseError | null {
    return (this.sizeOf(0) & this.sizeOf(1) & this.sizeOf(2)) !== 0
      ? null
      : this.error(1, 'Size mismatch');
  }

  numericDestOK(): ParseError | null {
    if (!matches(this.type(0), Op.REG | Op.MEM)) {
      return this.error(
        0,
        'Invalid parameter. Must specify a register or a memory address as destination.',
      );
    }
    return null;
  }

  numericSrcOK(): ParseError | null {
    let immediateDefaultSize = false;
    if ((this.sizeOf(0) & this.sizeOf(1) & this.sizeOf(2)) === 0)
      return this.error(1, 'Size mismatch');
    if (
      !matches(
        this.type(1),
        Op.REG | Op.MEM | Op.IMM | Op.CHARS | Op.VARIABLE | Op.LABEL | Op.CONST,
      )
    ) {
      return this.error(
        1,
        'Invalid parameter. Must specify a register, a memory address or an immediate as operand.',
      );
    }
    if (matches(this.type(1), Op.IMM) && this.sizeOf(1) === -1) {
      this.argument(1).address.size = operandSize(this.arg(1), this.type(1), this.dsp);
      immediateDefaultSize = true;
    }
    if (this.sizeOf(0) >= 0 && this.sizeOf(1) > this.sizeOf(0)) {
      return this.error(1, 'Operand too large, does not fit into destination.');
    }
    if (
      matches(this.type(0), Op.REG) &&
      matches(this.type(1), Op.REG) &&
      this.type(0) !== this.type(1)
    ) {
      return this.error(1, 'Register sizes mismatch.');
    }
    if (immediateDefaultSize) this.argument(1).address.size = -1;
    return null;
  }

  firstRegMemSecondReg(): ParseError | null {
    if (!matches(this.type(0), Op.REG | Op.MEM)) {
      return this.error(0, 'First argument must be a register or memory address');
    }
    if (!matches(this.type(1), Op.REG)) return this.error(1, 'Second argument must be a register');
    return this.numericSrcOK();
  }

  prepareAB(): void {
    this.a = this.get(0);
    this.b = this.get(1);
  }

  validate(index: number, allowedTypes: number): ParseError | null {
    return matches(this.type(index), allowedTypes)
      ? null
      : this.error(index, operandTypeErrorMessage(allowedTypes));
  }

  validateAll(allowedTypes: number): ParseError | null {
    for (let i = 0; i < this.numArguments; i++) {
      const e = this.validate(i, allowedTypes);
      if (e) return e;
    }
    return null;
  }

  validateAllSizes(minSize: number, maxSize: number): ParseError | null {
    for (let i = 0; i < this.numArguments; i++) {
      const arg = this.argument(i);
      const size = arg.sizeExplicit
        ? this.sizeOf(i)
        : operandSize(this.arg(i), this.type(i), this.dsp);
      if (matches(this.type(i), Op.CHARS | Op.STRING)) continue;
      if (size < minSize) {
        if (matches(this.type(i), Op.IMM | Op.MU) && !arg.sizeExplicit) {
          arg.address.size = minSize;
          // Sign-extend immediates if necessary.
          arg.address.value = this.dsp.getInitial(arg.arg, arg.address.type, minSize, this.signed);
        } else {
          return this.error(
            i,
            `Operand must be at least ${minSize} byte${minSize !== 1 ? 's' : ''} large`,
          );
        }
      }
      if (size > maxSize) {
        return this.error(
          i,
          `Operand must not be larger than ${maxSize} byte${maxSize !== 1 ? 's' : ''}`,
        );
      }
      this.size = Math.max(this.size, this.sizeOf(i), size);
    }
    return null;
  }

  st0contained(): ParseError | null {
    return this.arg(0) === 'ST0' || this.arg(1) === 'ST0'
      ? null
      : this.error(1, 'One of the arguments must be ST0');
  }

  private shiftParam(from: number, to: number): void {
    this.args[to] = this.args[from];
    if (this.numArguments <= to) this.numArguments = to + 1;
  }

  /** Adds the implicit operands of an FPU instruction (ST1/ST0 defaults, `TO` form). */
  normalizeParameters(): void {
    if (matches(this.type(0), Op.NULL)) {
      this.args[0] = FullArgument.implicit(Op.FPUREG, 8, 1);
      this.args[1] = FullArgument.implicit(Op.FPUREG, 8, 0);
      return;
    }
    if (matches(this.type(1), Op.NULL)) {
      this.shiftParam(0, 1);
      this.args[0] = FullArgument.implicit(Op.FPUREG, 8, 0);
      return;
    }
    if (matches(this.type(0), Op.FPUQUALI)) {
      this.shiftParam(1, 0);
      this.args[1] = FullArgument.implicit(Op.FPUREG, 8, 0);
    }
  }

  /** Adds the implicit operands of a popping FPU instruction. */
  normalizePopParameters(): void {
    if (matches(this.type(0), Op.NULL)) {
      this.args[0] = FullArgument.implicit(Op.FPUREG, 8, 1);
      this.args[1] = FullArgument.implicit(Op.FPUREG, 8, 0);
      if (this.numArguments < 2) this.numArguments = 2;
      return;
    }
    if (matches(this.type(1), Op.NULL)) {
      this.args[1] = FullArgument.implicit(Op.FPUREG, 8, 0);
      if (this.numArguments < 2) this.numArguments = 2;
    }
  }
}
