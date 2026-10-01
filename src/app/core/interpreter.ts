import { DataSpace } from './data-space';
import { ParseError } from './parse-error';
import { Program } from './program';

export interface StepResult {
  /** The line that was executed. */
  readonly line: number;
  readonly error: ParseError | null;
}

/**
 * Executes a document's program line by line (spec 04 §9). M1 provides Step;
 * Run, breakpoints, snapshots and the change-counter rules come in M3.
 */
export class Interpreter {
  constructor(
    readonly dsp: DataSpace,
    readonly program: Program,
  ) {}

  get atEnd(): boolean {
    return this.dsp.getInstructionPointer() >= this.program.lineCount;
  }

  /**
   * Executes the line at EIP. On an error EIP stays on the failing line (07 Q-E-1);
   * past the last line Step only increments EIP (07 Q-E-2).
   */
  step(): StepResult {
    const line = this.dsp.getInstructionPointer();
    this.dsp.setInstructionPointer(line + 1);
    if (line < 0 || line >= this.program.lineCount) return { line, error: null };
    const error = this.program.parser.execute(
      this.program.line(line),
      this.program.lastLabel(line),
    );
    if (error) {
      this.dsp.setInstructionPointer(line);
      return { line, error };
    }
    this.dsp.updateDirty();
    return { line, error: null };
  }
}
