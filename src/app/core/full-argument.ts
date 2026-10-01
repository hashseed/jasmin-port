import { Address } from './address';
import { CalculatedAddress } from './calculated-address';
import { DataSpace } from './data-space';
import { Fpu } from './fpu';
import { Op, matches } from './op';

/** One operand as written in the source, with its type, size and location (port of `FullArgument`). */
export class FullArgument {
  address: Address;
  cAddress: CalculatedAddress | null = null;
  readonly usedLabels = new Set<string>();

  constructor(
    /** Upper-cased operand with literals converted to decimal. */
    readonly arg: string,
    /** The token as written (for error spans). */
    readonly original: string,
    readonly startPos: number,
    type: number,
    size: number,
    public sizeExplicit: boolean,
    dsp: DataSpace | null,
  ) {
    const register = type & Op.REG && dsp ? dsp.getRegisterArgument(arg) : undefined;
    this.address = register ?? new Address(type, size, 0);
    if (matches(type, Op.LABEL | Op.CONST | Op.VARIABLE)) this.usedLabels.add(arg);
  }

  /** An implicit operand, e.g. ST1 added by FPU instructions without operands. */
  static implicit(type: number, size: number, address: number): FullArgument {
    const a = new FullArgument('', '', 0, Op.NULL, -1, false, null);
    a.address = new Address(type, size, address);
    return a;
  }

  /** Resolves memory and FPU operands to their address. */
  calculateAddress(dsp: DataSpace): void {
    if (this.address.type & Op.MEM) {
      this.cAddress = new CalculatedAddress(dsp);
      this.cAddress.readFromString(this.arg);
      this.address.address = this.cAddress.calculateEffectiveAddress(true);
      for (const label of this.cAddress.usedLabels) this.usedLabels.add(label);
    }
    if (this.address.type & Op.FPUREG) this.address.address = Fpu.getAddress(this.arg);
  }
}
