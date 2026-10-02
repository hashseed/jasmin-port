import { Command } from './command';
import { DataSpace } from './data-space';
import { Parameters } from './parameters';
import { ParseError } from './parse-error';
import { Program } from './program';

export interface StepResult {
  /** The line that was executed. */
  readonly line: number;
  readonly error: ParseError | null;
}

/** Why a batch of Run steps returned (spec 04 §9.3). */
export type RunOutcome =
  /** The step budget ran out; call `runSteps` again to continue. */
  | { readonly kind: 'continue' }
  /** EIP reached a breakpoint line; EIP stays on it. */
  | { readonly kind: 'breakpoint'; readonly line: number }
  /** EIP went past the last line. */
  | { readonly kind: 'end' }
  /** A line failed; EIP stays on it (07 Q-E-1). */
  | { readonly kind: 'error'; readonly line: number; readonly error: ParseError }
  /** A `JASMINSLEEP` asked to wait before the next step. */
  | { readonly kind: 'sleep'; readonly ms: number };

const END: RunOutcome = { kind: 'end' };
const CONTINUE: RunOutcome = { kind: 'continue' };

interface CachedLine {
  readonly command: Command | null;
  readonly param: Parameters | null;
  /** `command.execute`, read once (the call site sees every instruction class). */
  readonly execute: Command['execute'] | null;
}

/**
 * Executes a document's program (spec 04 §9). Step and Execute current line run
 * synchronously; Run is split into batches by `runSteps` so the caller can keep
 * the UI responsive and pause between batches.
 */
export class Interpreter {
  /**
   * Run's per-line parse cache (spec 04 §9.3), valid between beginRun and endRun.
   * Indexed by line number (an array is cheaper than a Map in the run loop).
   */
  private cache: (CachedLine | undefined)[] = [];
  private skipBreakpointAt = -1;

  constructor(
    readonly dsp: DataSpace,
    readonly program: Program,
  ) {}

  get atEnd(): boolean {
    return this.dsp.getInstructionPointer() >= this.program.lineCount;
  }

  /**
   * Executes the line at EIP. On an error EIP stays on the failing line (07 Q-E-1);
   * past the last line Step only increments EIP (07 Q-E-2). A `JASMINSLEEP` delay is
   * dropped: it only applies to Run.
   */
  step(): StepResult {
    const line = this.dsp.getInstructionPointer();
    this.dsp.setInstructionPointer(line + 1);
    if (line < 0 || line >= this.program.lineCount) return { line, error: null };
    const error = this.executeUncached(line);
    this.dsp.pendingSleepMs = 0;
    if (error) this.dsp.setInstructionPointer(line);
    return { line, error };
  }

  /**
   * Executes `line` without advancing EIP (spec 04 §9.4). Jumps, `CALL` and `RET`
   * still set EIP; `CALL` pushes the current EIP.
   */
  executeLine(line: number): StepResult {
    if (line < 0 || line >= this.program.lineCount) return { line, error: null };
    const error = this.executeUncached(line);
    this.dsp.pendingSleepMs = 0;
    return { line, error };
  }

  /**
   * Starts a run: clears the parse cache and ignores a breakpoint on the line at
   * EIP once (spec 04 §9.3 step 2).
   */
  beginRun(isBreakpoint: (line: number) => boolean): void {
    this.cache = [];
    const ip = this.dsp.getInstructionPointer();
    this.skipBreakpointAt = isBreakpoint(ip) ? ip : -1;
  }

  /** Runs up to `maxSteps` lines of the current run. */
  runSteps(maxSteps: number, isBreakpoint: (line: number) => boolean): RunOutcome {
    const dsp = this.dsp;
    const registers = dsp.registers;
    // Nothing else runs during a batch, so the program cannot change.
    const lineCount = this.program.lineCount;
    for (let n = 0; n < maxSteps; n++) {
      const line = registers.instructionPointer;
      if (line < 0 || line >= lineCount) return END;
      if (isBreakpoint(line)) {
        if (line !== this.skipBreakpointAt) return { kind: 'breakpoint', line };
        this.skipBreakpointAt = -1;
      }
      registers.setInstructionPointer(line + 1);
      const error = this.executeCached(line);
      if (error) {
        registers.setInstructionPointer(line);
        dsp.pendingSleepMs = 0;
        return { kind: 'error', line, error };
      }
      if (dsp.pendingSleepMs > 0) {
        const ms = dsp.pendingSleepMs;
        dsp.pendingSleepMs = 0;
        return { kind: 'sleep', ms };
      }
    }
    return CONTINUE;
  }

  /** Ends a run: advances the change counter once (spec 04 §8) and drops the cache. */
  endRun(): void {
    this.dsp.updateDirty();
    this.cache = [];
    this.skipBreakpointAt = -1;
  }

  private executeUncached(line: number): ParseError | null {
    return this.program.parser.execute(this.program.line(line), this.program.lastLabel(line));
  }

  /**
   * Run's execution path (`Parser.execute` with a line number): the first visit
   * parses, validates and executes the line; later visits reuse the parsed command.
   */
  private executeCached(line: number): ParseError | null {
    const cached = this.cache[line];
    if (cached) {
      const { command, param, execute } = cached;
      if (!command || !param || !execute) return null;
      return this.program.parser.checkResult(execute.call(command, param), false);
    }
    const parsed = this.program.parser.parse(this.program.line(line), this.program.lastLabel(line));
    const command = parsed.command;
    this.cache[line] = { command, param: parsed.param, execute: command ? command.execute : null };
    return this.program.parser.executeParsed(parsed, false);
  }
}
