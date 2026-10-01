import { Injectable, Signal, computed, inject } from '@angular/core';
import { DocumentStore } from './document-store';
import { FileService } from './file.service';
import { WorkspaceService } from './workspace.service';

export type ActionId =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'saveMemory'
  | 'loadMemory'
  | 'closeDocument'
  | 'configuration'
  | 'exit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'back'
  | 'forward'
  | 'run'
  | 'pause'
  | 'runPause'
  | 'step'
  | 'executeLine'
  | 'stop'
  | 'reset'
  | 'takeSnapshot'
  | 'loadSnapshot'
  | 'closeTab';

/** A command of the menus, toolbar or keyboard, with its enablement (spec 02 §4). */
export interface AppAction {
  readonly id: ActionId;
  /** Menu item text (spec 02 §2). */
  readonly label: string;
  /** Toolbar tooltip (spec 02 §3), without the shortcut. */
  readonly tooltip: string;
  /** The effective shortcut as shown in menus and tooltips. */
  readonly shortcut?: string;
  readonly enabled: Signal<boolean>;
  run(): void;
}

type ActionSpec = Omit<AppAction, 'id' | 'tooltip'> & { tooltip?: string };

/**
 * All commands of the shell. Each action's `enabled` is one computed signal
 * implementing `MainFrame.checkButtonStates` (spec 02 §4) with 07 Q-UI-1 applied:
 * Stop and the Pause menu item stay enabled while running.
 */
@Injectable({ providedIn: 'root' })
export class ActionsService {
  private readonly workspace = inject(WorkspaceService);
  private readonly files = inject(FileService);

  private readonly doc = this.workspace.document;
  /** A document tab is selected. */
  private readonly hasDocument = computed(() => this.doc() !== null);
  /** A document tab is selected and not running. */
  private readonly idle = computed(() => {
    const doc = this.doc();
    return doc !== null && !doc.running();
  });
  /** A document tab is selected and running. */
  private readonly running = computed(() => this.doc()?.running() ?? false);

  private readonly always = computed(() => true);

  /** Whether the Edit menu can be opened. */
  readonly editMenuEnabled = this.idle;
  /** Whether the Run menu can be opened (it holds Pause, so it stays enabled while running). */
  readonly runMenuEnabled = this.hasDocument;
  /** The selected document is running: the Run/Pause button shows Pause. */
  readonly isRunning: Signal<boolean> = this.running;

  readonly actions: Readonly<Record<ActionId, AppAction>> = this.build({
    new: {
      label: 'New',
      tooltip: 'Create a new Document',
      shortcut: 'Alt+N',
      enabled: this.always,
      run: () => this.workspace.newDocument(),
    },
    open: {
      label: 'Open Code',
      tooltip: 'Open Sourcecode',
      shortcut: 'Ctrl+O',
      enabled: this.always,
      run: () => void this.files.openCode(),
    },
    save: {
      label: 'Save Code',
      tooltip: 'Save Sourcecode',
      shortcut: 'Ctrl+S',
      enabled: this.idle,
      run: () => this.withDoc((d) => void this.files.saveCode(d)),
    },
    // Port addition, keyboard only: Save Code always writes back once the document
    // has a file (09 §2), so this is the way to save under another name.
    saveAs: {
      label: 'Save Code As',
      tooltip: 'Save Sourcecode as',
      shortcut: 'Ctrl+Shift+S',
      enabled: this.idle,
      run: () => this.withDoc((d) => void this.files.saveCodeAs(d)),
    },
    saveMemory: {
      label: 'Save Memory',
      enabled: this.idle,
      run: () => this.withDoc((d) => void this.files.saveMemory(d)),
    },
    loadMemory: {
      label: 'Load Memory',
      enabled: this.always,
      run: () => void this.files.loadMemory(this.doc()),
    },
    closeDocument: {
      label: 'Close Document',
      enabled: this.idle,
      run: () => this.workspace.closeSelected(),
    },
    configuration: {
      label: 'Configuration',
      enabled: this.always,
      run: () => this.workspace.openHelp('configuration'),
    },
    exit: {
      label: 'Exit',
      enabled: this.always,
      run: () => this.workspace.closeAll(),
    },
    undo: {
      label: 'Undo',
      shortcut: 'Ctrl+Z',
      enabled: computed(() => this.idle() && (this.doc()?.canUndo() ?? false)),
      run: () => this.doc()?.editor?.undo(),
    },
    redo: {
      label: 'Redo',
      shortcut: 'Ctrl+R',
      enabled: computed(() => this.idle() && (this.doc()?.canRedo() ?? false)),
      run: () => this.doc()?.editor?.redo(),
    },
    cut: {
      label: 'Cut',
      enabled: computed(() => this.idle() && (this.doc()?.hasSelection() ?? false)),
      run: () => this.doc()?.editor?.cut(),
    },
    copy: {
      label: 'Copy',
      enabled: computed(() => this.idle() && (this.doc()?.hasSelection() ?? false)),
      run: () => this.doc()?.editor?.copy(),
    },
    paste: {
      label: 'Paste',
      enabled: this.idle,
      run: () => this.doc()?.editor?.paste(),
    },
    back: {
      label: 'Back',
      tooltip: 'Go back',
      enabled: computed(() => this.workspace.help()?.canBack() ?? false),
      run: () => this.workspace.help()?.back(),
    },
    forward: {
      label: 'Forward',
      tooltip: 'Go forward',
      enabled: computed(() => this.workspace.help()?.canForward() ?? false),
      run: () => this.workspace.help()?.forward(),
    },
    run: {
      label: 'Run',
      shortcut: 'F5',
      enabled: this.idle,
      run: () => this.withDoc((d) => d.run()),
    },
    pause: {
      label: 'Pause',
      shortcut: 'Ctrl+P',
      enabled: this.running,
      run: () => this.withDoc((d) => d.pause()),
    },
    runPause: {
      label: 'Run',
      tooltip: 'Run the program',
      shortcut: 'F5',
      enabled: this.hasDocument,
      run: () => this.withDoc((d) => d.toggleRun()),
    },
    step: {
      label: 'Step',
      tooltip: 'Execute the next command',
      shortcut: 'F7',
      enabled: this.idle,
      run: () => this.withDoc((d) => d.step()),
    },
    executeLine: {
      label: 'Execute current line',
      tooltip: 'Execute the line at the caret position without modifying the instruction pointer',
      shortcut: 'F9',
      enabled: this.idle,
      run: () => this.withDoc((d) => d.executeCurrentLine()),
    },
    stop: {
      label: 'Stop',
      tooltip: 'Stop the program',
      enabled: this.hasDocument,
      run: () => this.withDoc((d) => d.stop()),
    },
    reset: {
      label: 'Reset',
      tooltip: 'Reset the memory and all registers',
      enabled: this.hasDocument,
      run: () => this.withDoc((d) => d.reset()),
    },
    takeSnapshot: {
      label: 'Take Snapshot',
      enabled: this.idle,
      run: () => this.withDoc((d) => d.takeSnapshot()),
    },
    loadSnapshot: {
      label: 'Load Snapshot',
      enabled: computed(() => this.idle() && (this.doc()?.hasSnapshot() ?? false)),
      run: () => this.withDoc((d) => d.loadSnapshot()),
    },
    closeTab: {
      label: 'Close Tab',
      enabled: computed(() => this.workspace.selected() !== null),
      run: () => this.workspace.closeSelected(),
    },
  });

  /** Runs an action if it is enabled; returns whether it ran. */
  execute(id: ActionId): boolean {
    const action = this.actions[id];
    if (!action.enabled()) return false;
    action.run();
    return true;
  }

  private withDoc(fn: (doc: DocumentStore) => void): void {
    const doc = this.doc();
    if (doc) fn(doc);
  }

  private build(specs: Record<ActionId, ActionSpec>): Record<ActionId, AppAction> {
    const result = {} as Record<ActionId, AppAction>;
    for (const id of Object.keys(specs) as ActionId[]) {
      const spec = specs[id];
      result[id] = { ...spec, id, tooltip: spec.tooltip ?? spec.label };
    }
    return result;
  }
}
