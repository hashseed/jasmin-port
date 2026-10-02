import { DataSpace } from './data-space';
import { Interpreter, RunOutcome } from './interpreter';
import { remapLines } from './line-map';
import { DEFAULT_MACHINE_CONFIG, MachineConfig } from './machine-state';
import { Program } from './program';
import {
  MachineSnapshot,
  parseSnapshot,
  restoreSnapshot,
  serializeSnapshot,
  takeSnapshot,
} from './snapshot';

/** Timers for Run's time slices and `JASMINSLEEP`; injectable so tests can drive time. */
export interface Scheduler {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  now(): number;
  /**
   * Calls `callback` before the next frame is rendered (`requestAnimationFrame`).
   * Without it, live refreshes happen right away, within Run's time slice.
   */
  requestFrame?(callback: () => void): unknown;
  cancelFrame?(handle: unknown): void;
}

/** A pending zero-delay callback of an event-loop scheduler. */
class Yield {
  constructor(public callback: (() => void) | null) {}
}

/** The timer functions an event-loop scheduler uses (`globalThis` by default). */
export interface TimerHost {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  setImmediate?: (callback: () => void) => unknown;
  MessageChannel?: typeof MessageChannel;
  requestAnimationFrame?: (callback: () => void) => number;
  cancelAnimationFrame?: (handle: number) => void;
}

/**
 * Runs zero-delay callbacks as soon as the event loop is free, without the
 * minimum delay browsers impose on nested `setTimeout(0)` (4 ms, which would
 * leave Run idle a quarter of the time between its 12 ms slices): `setImmediate`
 * where it exists (Node), else a `MessageChannel` (browsers), else `setTimeout`.
 * Each yield is a separate task, so input, rendering and timers still get turns.
 */
function zeroDelay(host: TimerHost): (y: Yield) => void {
  const run = (y: Yield) => {
    const callback = y.callback;
    y.callback = null;
    callback?.();
  };
  const { setImmediate, MessageChannel: Channel } = host;
  if (typeof setImmediate === 'function') {
    return (y) => setImmediate.call(host, () => run(y));
  }
  if (typeof Channel === 'function') {
    const queue: Yield[] = [];
    let channel: MessageChannel | null = null;
    return (y) => {
      if (channel === null) {
        channel = new Channel();
        channel.port1.onmessage = () => run(queue.shift()!);
      }
      queue.push(y);
      channel.port2.postMessage(null);
    };
  }
  return (y) => host.setTimeout(() => run(y), 0);
}

/**
 * A scheduler on the event loop of `host`: delays use `setTimeout`, zero delays
 * (Run's yields between time slices) skip the browsers' nested-timeout clamp,
 * and frames use `requestAnimationFrame` where it exists (browsers).
 */
export function eventLoopScheduler(host: TimerHost = globalThis as TimerHost): Scheduler {
  let post: ((y: Yield) => void) | null = null;
  const { requestAnimationFrame: request, cancelAnimationFrame: cancel } = host;
  const frames: Pick<Scheduler, 'requestFrame' | 'cancelFrame'> =
    typeof request === 'function' && typeof cancel === 'function'
      ? {
          requestFrame: (callback) => request.call(host, () => callback()),
          cancelFrame: (handle) => cancel.call(host, handle as number),
        }
      : {};
  return {
    ...frames,
    setTimeout: (callback, ms) => {
      if (ms > 0) return host.setTimeout(callback, ms);
      const y = new Yield(callback);
      (post ??= zeroDelay(host))(y);
      return y;
    },
    clearTimeout: (handle) => {
      if (handle instanceof Yield) handle.callback = null;
      else host.clearTimeout(handle);
    },
    now: () => performance.now(),
  };
}

export const DEFAULT_SCHEDULER: Scheduler = eventLoopScheduler();

const LIVE_REFRESH: SessionEvent = { kind: 'refresh', reset: false, live: true };

export interface SessionOptions {
  /** Longest stretch of Run work before yielding to the event loop, in ms. */
  readonly sliceMs?: number;
  /** Lines executed between clock checks. */
  readonly batchSteps?: number;
  /** Shortest time between panel refreshes while a run is in progress, in ms. */
  readonly liveRefreshMs?: number;
}

export type SessionEvent =
  /**
   * Machine state changed: refresh all panels (spec 04 §9.6). `live`: a refresh
   * during Run (spec 04 §9.3), which panels that are not visible may skip; Run
   * ends with a refresh that is not live.
   */
  | { readonly kind: 'refresh'; readonly reset: boolean; readonly live?: boolean }
  /** Run started or stopped. When it stops, scroll to the execution mark. */
  | { readonly kind: 'running'; readonly running: boolean }
  /** Load Memory replaced the DataSpace (new memory size or offset). */
  | { readonly kind: 'machine-replaced' };

/**
 * One document's machine and program with the execution commands of the toolbar
 * and Run menu (spec 04 §9): Step, Run, Pause, Stop, Execute current line, Reset,
 * breakpoints, snapshots and memory files. Framework-free; the UI mirrors its
 * state into signals by subscribing.
 */
export class MachineSession {
  dsp: DataSpace;
  program: Program;
  interpreter: Interpreter;
  /** Message for the error line (spec 02 §6.4), or null. */
  error: string | null = null;
  snapshot: MachineSnapshot | null = null;

  private readonly breakpointLines = new Set<number>();
  private isRunning = false;
  private timer: unknown = null;
  private readonly listeners = new Set<(event: SessionEvent) => void>();
  private readonly sliceMs: number;
  private readonly batchSteps: number;
  private readonly liveRefreshMs: number;
  private lastLiveRefresh = 0;
  /** The requested frame of the next live refresh, or null. */
  private frame: unknown = null;
  private readonly isBreakpoint = (line: number) => this.breakpointLines.has(line);

  constructor(
    config: MachineConfig = DEFAULT_MACHINE_CONFIG,
    private readonly scheduler: Scheduler = DEFAULT_SCHEDULER,
    options: SessionOptions = {},
  ) {
    this.sliceMs = options.sliceMs ?? 12;
    this.batchSteps = options.batchSteps ?? 1000;
    this.liveRefreshMs = options.liveRefreshMs ?? 100;
    this.dsp = new DataSpace(config.memorySize, config.offset);
    this.program = new Program(this.dsp);
    this.interpreter = new Interpreter(this.dsp, this.program);
  }

  subscribe(listener: (event: SessionEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get running(): boolean {
    return this.isRunning;
  }

  // ---- program text and breakpoints ----

  /** Replaces the program text; breakpoints move with their lines (07 Q-UI-2). */
  setText(text: string): void {
    const oldLines = this.program.text.split('\n');
    this.program.setText(text);
    const moved = remapLines(oldLines, this.program.text.split('\n'), this.breakpointLines);
    this.breakpointLines.clear();
    for (const line of moved) this.breakpointLines.add(line);
    this.interpreter.breakpointsChanged();
  }

  get breakpoints(): ReadonlySet<number> {
    return this.breakpointLines;
  }

  hasBreakpoint(line: number): boolean {
    return this.breakpointLines.has(line);
  }

  toggleBreakpoint(line: number): void {
    if (line < 0 || line >= this.program.lineCount) return;
    if (!this.breakpointLines.delete(line)) this.breakpointLines.add(line);
    // A run in progress must stop at the new breakpoint (compiled code knows the old ones).
    this.interpreter.breakpointsChanged();
  }

  // ---- execution ----

  /** Step (spec 04 §9.2). */
  step(): void {
    if (this.isRunning) return;
    const { error } = this.interpreter.step();
    this.error = error?.errorMsg ?? null;
    this.emit({ kind: 'refresh', reset: false });
  }

  /** Execute current line (spec 04 §9.4): `line` is the line with the caret. */
  executeLine(line: number): void {
    if (this.isRunning) return;
    const { error } = this.interpreter.executeLine(line);
    this.error = error?.errorMsg ?? null;
    this.emit({ kind: 'refresh', reset: false });
  }

  /** Run (spec 04 §9.3); continues in time slices until a stop condition or Pause. */
  run(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.error = null;
    this.interpreter.beginRun(this.isBreakpoint);
    this.emit({ kind: 'running', running: true });
    this.lastLiveRefresh = this.scheduler.now();
    this.schedule(0);
  }

  /** Pause (spec 04 §9.9): stops after the current instruction, cutting a sleep short. */
  pause(): void {
    if (this.isRunning) this.finishRun();
  }

  /** Stop (spec 04 §9.8): pause, then `EIP := 0`. */
  stop(): void {
    this.pause();
    this.dsp.setInstructionPointer(0);
    this.emit({ kind: 'refresh', reset: false });
  }

  /** Gutter right-click: move the execution mark to `line`. */
  setInstructionPointer(line: number): void {
    if (this.isRunning) return;
    this.dsp.setInstructionPointer(line);
    this.emit({ kind: 'refresh', reset: false });
  }

  /**
   * Reset (spec 04 §9.7): clears the machine and re-parses the program. Breakpoints,
   * text and snapshot are kept. Pauses a run first.
   */
  reset(): void {
    this.pause();
    this.dsp.clear();
    this.program.reparse();
    this.error = null;
    this.emit({ kind: 'refresh', reset: true });
  }

  // ---- snapshots and memory files ----

  /** Take Snapshot (spec 04 §9.10): one slot, replaced each time. */
  takeSnapshot(): void {
    this.snapshot = takeSnapshot(this.dsp);
  }

  /** Load Snapshot (spec 04 §9.10). */
  loadSnapshot(): void {
    if (!this.snapshot) return;
    this.pause();
    restoreSnapshot(this.dsp, this.snapshot);
    this.emit({ kind: 'refresh', reset: false });
  }

  /** Save Memory: the `.mem` file text (spec 09 §4.3). */
  saveMemory(): string {
    return serializeSnapshot(takeSnapshot(this.dsp));
  }

  /**
   * Load Memory (spec 09 §4.3). Returns false (and changes nothing) if `text` is
   * not a valid memory file; the caller shows `Not a Jasmin memory file.`
   */
  loadMemory(text: string): boolean {
    const snapshot = parseSnapshot(text);
    if (!snapshot) return false;
    this.pause();
    if (snapshot.memorySize !== this.dsp.memorySize || snapshot.offset !== this.dsp.offset) {
      const source = this.program.text;
      this.dsp = new DataSpace(snapshot.memorySize, snapshot.offset);
      this.program = new Program(this.dsp);
      this.program.setText(source);
      this.interpreter = new Interpreter(this.dsp, this.program);
      this.snapshot = null;
      this.emit({ kind: 'machine-replaced' });
    }
    restoreSnapshot(this.dsp, snapshot);
    this.emit({ kind: 'refresh', reset: false });
    return true;
  }

  // ---- run loop ----

  private schedule(ms: number): void {
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.slice();
    }, ms);
  }

  private slice(): void {
    if (!this.isRunning) return;
    const deadline = this.scheduler.now() + this.sliceMs;
    for (;;) {
      const outcome: RunOutcome = this.interpreter.runSteps(this.batchSteps, this.isBreakpoint);
      switch (outcome.kind) {
        case 'continue':
          if (this.scheduler.now() < deadline) continue;
          this.liveRefresh();
          this.schedule(0);
          return;
        case 'sleep':
          this.liveRefresh();
          this.schedule(outcome.ms);
          return;
        case 'error':
          this.error = outcome.error.errorMsg;
          this.finishRun();
          return;
        case 'breakpoint':
        case 'end':
          this.finishRun();
          return;
      }
    }
  }

  /**
   * Lets the panels follow a run in progress, at most every `liveRefreshMs` and
   * once per frame (spec 04 §9.3). The refresh runs in the frame callback, outside
   * the time slice, and shows the state as of then; a frame already requested
   * covers later slices too.
   */
  private liveRefresh(): void {
    if (this.frame !== null) return;
    const now = this.scheduler.now();
    if (now - this.lastLiveRefresh < this.liveRefreshMs) return;
    if (!this.scheduler.requestFrame) {
      this.lastLiveRefresh = now;
      this.emit(LIVE_REFRESH);
      return;
    }
    this.frame = this.scheduler.requestFrame(() => {
      this.frame = null;
      if (!this.isRunning) return;
      this.lastLiveRefresh = this.scheduler.now();
      this.emit(LIVE_REFRESH);
    });
  }

  private finishRun(): void {
    if (this.timer !== null) {
      this.scheduler.clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.frame !== null) {
      this.scheduler.cancelFrame?.(this.frame);
      this.frame = null;
    }
    this.isRunning = false;
    this.interpreter.endRun();
    this.emit({ kind: 'refresh', reset: false });
    this.emit({ kind: 'running', running: false });
  }

  private emit(event: SessionEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
