import { Signal, WritableSignal, signal } from '@angular/core';
import { MachineSession, SessionEvent } from '../core';

/**
 * What the shell needs from a document's editor: the Edit menu commands. The
 * editor component registers itself on its store; M5's CodeMirror editor
 * implements the same interface.
 */
export interface EditorHandle {
  undo(): void;
  redo(): void;
  cut(): void;
  copy(): void;
  paste(): void;
  focus(): void;
}

/** Divider positions of one document view (spec 02 §5); null = computed default. */
export interface SplitLayout {
  readonly split1: WritableSignal<number | null>;
  readonly split2: WritableSignal<number | null>;
  readonly split3: WritableSignal<number | null>;
  readonly split4: WritableSignal<number | null>;
}

export type SplitName = keyof SplitLayout;

let nextDocumentId = 1;

/**
 * One open document: its {@link MachineSession} plus the session's state
 * mirrored into signals for the UI. The session stays the single source of
 * truth; the store subscribes to its events and re-reads after each command.
 */
export class DocumentStore {
  readonly id = nextDocumentId++;
  readonly title: WritableSignal<string>;
  readonly text = signal('');

  private readonly runningState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly snapshotState = signal(false);
  private readonly versionState = signal(0);

  /** True while Run is in progress (spec 02 §4 "running"). */
  readonly running: Signal<boolean> = this.runningState.asReadonly();
  /** The error line text (spec 02 §6.4), or null. */
  readonly error: Signal<string | null> = this.errorState.asReadonly();
  /** Whether Load Snapshot has something to restore. */
  readonly hasSnapshot: Signal<boolean> = this.snapshotState.asReadonly();
  /** Bumps whenever panels must refresh (spec 04 §9.6). */
  readonly version: Signal<number> = this.versionState.asReadonly();

  // Editor state, written by the editor component.
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly hasSelection = signal(false);
  /** Zero-based line of the caret, for Execute current line. */
  readonly caretLine = signal(0);
  editor: EditorHandle | null = null;

  readonly layout: SplitLayout;

  private readonly unsubscribe: () => void;

  constructor(
    readonly session: MachineSession,
    title = 'new document',
    layout: Partial<Record<SplitName, number | null>> = {},
  ) {
    this.title = signal(title);
    this.text.set(session.program.text);
    this.layout = {
      split1: signal(layout.split1 ?? null),
      split2: signal(layout.split2 ?? null),
      split3: signal(layout.split3 ?? null),
      split4: signal(layout.split4 ?? null),
    };
    this.unsubscribe = session.subscribe((event) => this.onEvent(event));
    this.sync();
  }

  setText(text: string): void {
    if (text === this.session.program.text) return;
    this.session.setText(text);
    this.text.set(this.session.program.text);
    this.versionState.update((v) => v + 1);
  }

  /**
   * Re-renders the panels after the UI wrote to the machine directly (a register,
   * flag, FPU or memory edit). Does not touch the change counter (spec 04 §8).
   */
  refreshPanels(): void {
    this.versionState.update((v) => v + 1);
  }

  step(): void {
    this.session.step();
    this.sync();
  }

  run(): void {
    this.session.run();
    this.sync();
  }

  pause(): void {
    this.session.pause();
    this.sync();
  }

  /** The toolbar's Run/Pause toggle (spec 02 §3, button 11). */
  toggleRun(): void {
    if (this.session.running) this.pause();
    else this.run();
  }

  stop(): void {
    this.session.stop();
    this.sync();
  }

  executeCurrentLine(): void {
    this.session.executeLine(this.caretLine());
    this.sync();
  }

  reset(): void {
    this.session.reset();
    this.sync();
  }

  takeSnapshot(): void {
    this.session.takeSnapshot();
    this.sync();
  }

  loadSnapshot(): void {
    this.session.loadSnapshot();
    this.sync();
  }

  saveMemory(): string {
    return this.session.saveMemory();
  }

  loadMemory(text: string): boolean {
    const ok = this.session.loadMemory(text);
    this.sync();
    return ok;
  }

  /** Stops a run and detaches from the session (tab closed). */
  dispose(): void {
    this.session.pause();
    this.unsubscribe();
    this.editor = null;
  }

  private onEvent(event: SessionEvent): void {
    if (event.kind === 'running') this.runningState.set(event.running);
    else this.versionState.update((v) => v + 1);
    this.sync();
  }

  private sync(): void {
    this.runningState.set(this.session.running);
    this.errorState.set(this.session.error);
    this.snapshotState.set(this.session.snapshot !== null);
  }
}
