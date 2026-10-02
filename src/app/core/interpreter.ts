import { Command } from './command';
import { CompiledRegion, MAX_REGION_LINES, compileRegion } from './compiled-run';
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
  /**
   * Run's compiled code (`compiled-run.ts`): the region of each line, if compiled.
   * Built from the parse cache and the breakpoints of `compiledFor`, so dropped with
   * the cache (each run starts afresh: text, Reset and Load Memory cannot change a
   * run in progress) and when the breakpoints change.
   */
  private regions: (CompiledRegion | undefined)[] = [];
  private compiledFor: ((line: number) => boolean) | null = null;
  /** Whether Run may use compiled code (tests compare it with the plain loop). */
  useCompiledCode = true;
  /** Lines Run executed as compiled code and line by line, for statistics. */
  readonly runStats = { compiled: 0, interpreted: 0 };

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
    this.dropCompiled();
    const ip = this.dsp.getInstructionPointer();
    this.skipBreakpointAt = isBreakpoint(ip) ? ip : -1;
  }

  /**
   * Drops Run's compiled code. Call when breakpoints change during a run (the code
   * does not run into breakpoint lines it knows of).
   */
  breakpointsChanged(): void {
    this.dropCompiled();
  }

  private dropCompiled(): void {
    this.regions = [];
    this.compiledFor = null;
  }

  /**
   * Runs up to `maxSteps` lines of the current run. Lines run from the parse cache,
   * one by one or, once they ran before, as compiled code (spec 04 §9.3 port note).
   */
  runSteps(maxSteps: number, isBreakpoint: (line: number) => boolean): RunOutcome {
    const dsp = this.dsp;
    const registers = dsp.registers;
    // Nothing else runs during a batch, so the program cannot change.
    const lineCount = this.program.lineCount;
    if (isBreakpoint !== this.compiledFor) {
      this.regions = [];
      this.compiledFor = isBreakpoint;
    }
    const regions = this.regions;
    const stats = this.runStats;
    let outcome = CONTINUE;
    let executed = false;
    for (let n = 0; n < maxSteps;) {
      const line = registers.instructionPointer;
      if (line < 0 || line >= lineCount) {
        outcome = END;
        break;
      }
      if (isBreakpoint(line)) {
        if (line !== this.skipBreakpointAt) {
          outcome = { kind: 'breakpoint', line };
          break;
        }
        this.skipBreakpointAt = -1;
      }
      let region = regions[line];
      if (region === undefined && this.useCompiledCode && this.cache[line]) {
        region = this.compileAround(line, isBreakpoint);
      }
      // Compiled code assumes no out-of-range state is left over (it only tests it
      // after lines that can set it); a leftover one runs line by line.
      if (region && region.entryCost(line) <= maxSteps - n && !dsp.addressOutOfRange()) {
        executed = true;
        const count = region.run(line, maxSteps - n);
        n += count;
        stats.compiled += count;
        const error = region.error;
        if (error) {
          region.error = null;
          dsp.pendingSleepMs = 0;
          outcome = { kind: 'error', line: region.errorLine, error };
          break;
        }
        if (dsp.pendingSleepMs > 0) {
          outcome = { kind: 'sleep', ms: dsp.pendingSleepMs };
          dsp.pendingSleepMs = 0;
          break;
        }
        continue;
      }
      n++;
      stats.interpreted++;
      // EIP's change stamp is set once below.
      registers.moveInstructionPointer(line + 1);
      executed = true;
      const error = this.executeCached(line);
      if (error) {
        registers.moveInstructionPointer(line);
        dsp.pendingSleepMs = 0;
        outcome = { kind: 'error', line, error };
        break;
      }
      if (dsp.pendingSleepMs > 0) {
        outcome = { kind: 'sleep', ms: dsp.pendingSleepMs };
        dsp.pendingSleepMs = 0;
        break;
      }
    }
    // The change counter does not move during a run (spec 04 §8), so EIP's writes
    // by this batch all carry the same stamp: set it once.
    if (executed) registers.stampInstructionPointer();
    return outcome;
  }

  /** Ends a run: advances the change counter once (spec 04 §8) and drops the cache. */
  endRun(): void {
    this.dsp.updateDirty();
    this.cache = [];
    this.dropCompiled();
    this.skipBreakpointAt = -1;
  }

  /**
   * Compiles the cached lines around `line` (up to MAX_REGION_LINES) into one
   * region, replacing the regions of those lines.
   */
  private compileAround(line: number, isBreakpoint: (line: number) => boolean): CompiledRegion {
    const cache = this.cache;
    let start = line;
    let end = line;
    while (start > 0 && cache[start - 1] && line - start < MAX_REGION_LINES / 2) start--;
    while (
      end + 1 < this.program.lineCount &&
      cache[end + 1] &&
      end - start + 1 < MAX_REGION_LINES
    ) {
      end++;
    }
    const region = compileRegion(this.dsp, cache, start, end, isBreakpoint);
    for (let i = start; i <= end; i++) this.regions[i] = region;
    return region;
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
