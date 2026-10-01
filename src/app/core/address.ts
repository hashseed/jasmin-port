import { Op, matches } from './op';

/** Data type tags used by FPU memory operands (`Fpu.FLOAT` etc. in the original). */
export const FpuDataType = { NONE: 0, INTEGER: 2001, PACKED_BCD: 2002, FLOAT: 2003 } as const;

/**
 * Where an operand lives: a register (by index into the register file), a memory
 * address, an FPU register (relative to TOP), or a static value (port of
 * `jasmin.core.Address`).
 */
export class Address {
  datatype: number = FpuDataType.NONE;
  value = 0n;
  dynamic = false;
  /** Registers only: bit mask within the 32-bit register and right shift (AH: 0xFF00, 8). */
  mask = 0;
  rshift = 0;

  constructor(
    public type: number,
    public size: number,
    public address: number,
  ) {
    if (matches(type, Op.MEM | Op.REG | Op.FPUREG)) this.dynamic = true;
  }

  /** A static (non-dynamic) value, like the `Address(int, int, long)` constructor. */
  static ofValue(type: number, size: number, value: bigint): Address {
    const a = new Address(Op.NULL, size, -1);
    a.type = type;
    a.dynamic = false;
    a.value = value;
    return a;
  }

  clone(): Address {
    const a = new Address(this.type, this.size, this.address);
    a.datatype = this.datatype;
    a.value = this.value;
    a.dynamic = this.dynamic;
    a.mask = this.mask;
    a.rshift = this.rshift;
    return a;
  }

  equals(other: Address): boolean {
    return (
      other.type === this.type &&
      other.size === this.size &&
      other.address === this.address &&
      other.mask === this.mask
    );
  }

  containsAddress(address: number): boolean {
    return address >= this.address && address < this.address + this.size;
  }
}

/** Extra information stored with a memory cell or register, e.g. that it holds a label's line. */
export interface MemCellInfo {
  readonly type: number;
  readonly value: string;
  readonly size: number;
}
