import { PseudoCommand } from '../command';
import { charsAsNumber } from '../data-space';
import { Op, matches, splitLongString } from '../op';
import { Parameters } from '../parameters';

/** DB, DW, DD, DQ: allocate and initialize data when executed (spec 04 §5). */
export class DB extends PseudoCommand {
  readonly mnemonics = ['DB', 'DW', 'DD', 'DQ'];

  override defaultSize(mnemo: string): number {
    return PseudoCommand.operationSize(mnemo);
  }

  validate(p: Parameters) {
    let allowed: number;
    switch (p.mnemo) {
      case 'DD':
        allowed = Op.IMM | Op.CHARS | Op.STRING | Op.FLOAT | Op.NULL | Op.LABEL | Op.CONST;
        break;
      case 'DQ':
        allowed = Op.FLOAT | Op.NULL | Op.LABEL;
        break;
      default:
        allowed = Op.IMM | Op.CHARS | Op.STRING | Op.NULL | Op.LABEL | Op.CONST;
    }
    return p.validateAll(allowed) ?? p.validateAllSizes(-1, PseudoCommand.operationSize(p.mnemo));
  }

  execute(p: Parameters): void {
    for (let i = 0; i < p.numArguments; i++) {
      let address = this.dsp.malloc(p.size, 1);
      // Out of memory: the out-of-range flag is set and reported as a runtime error.
      if (!address) return;
      if (p.label !== null && i === 0) this.dsp.setVariableAddress(p.label, address.address);
      if (p.type(i) === Op.LABEL) {
        this.dsp.put(p.get(i), address, { type: Op.LABEL, value: p.arg(i), size: p.size });
      } else if (p.type(i) === Op.STRING || p.sizeOf(i) > p.size) {
        const parts = splitLongString(p.arg(i), p.size);
        for (let j = 0; j < parts.length; j++) {
          if (j > 0) address = this.dsp.malloc(p.size, 1);
          if (!address) return;
          this.dsp.put(charsAsNumber(parts[j]), address, null);
        }
      } else if (matches(p.type(i), Op.IMM | Op.CHARS | Op.FLOAT | Op.STRING | Op.CONST)) {
        this.dsp.put(p.get(i), address, null);
      }
    }
  }
}
