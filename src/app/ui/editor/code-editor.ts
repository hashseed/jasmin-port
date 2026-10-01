import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { MachineSession, SessionEvent } from '../../core';
import { DocumentStore, EditorHandle } from '../../services/document-store';
import { SettingsService } from '../../services/settings.service';
import { MenuEntries, MenuPanel } from '../shell/menu-panel';
import {
  EditorHost,
  insertNewlineKeepIndent,
  insertTabCharacter,
  jasminEditor,
  refreshEffect,
  scrollToMark,
} from './jasmin-extensions';

/** Context menu of spec 02 §6.1. */
const CONTEXT_MENU: MenuEntries = ['undo', 'redo', null, 'cut', 'copy', 'paste'];

/** Undo history depth of spec 02 §6.1. */
const HISTORY_DEPTH = 99_999;

/** Java logical font names (spec 02 §6.1) and the bundled fonts, as CSS families. */
export function fontFamily(name: string): string {
  switch (name) {
    case 'Sans Serif':
    case 'SansSerif':
      return 'sans-serif';
    case 'Monospaced':
      return 'monospace';
    case 'Serif':
      return 'serif';
    case 'JetBrains Mono':
      return 'var(--font-mono)';
    case 'Inter':
      return 'var(--font-ui)';
    default:
      return `"${name.replace(/["\\]/g, '')}", var(--font-mono)`;
  }
}

const editorTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--bg-panel)', color: 'var(--text)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'inherit', lineHeight: '1.5' },
  '.cm-content': { padding: '0', caretColor: 'var(--text)' },
  '.cm-line': { padding: '0 var(--space-2)' },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-subtle)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)',
  },
  '.jas-gutter .cm-gutterElement': { padding: '0', cursor: 'pointer' },
  '.jas-row': {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '0 var(--space-2) 0 6px',
  },
  '.jas-number': { flex: '1', textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
  '.jas-breakpoint': { width: '10px', height: '10px', flex: 'none', borderRadius: '50%' },
  '.jas-row:hover .jas-breakpoint': { boxShadow: 'inset 0 0 0 1px var(--stop)' },
  '.jas-has-breakpoint .jas-breakpoint': { backgroundColor: 'var(--stop)' },
  '.jas-exec-row, .jas-exec-gutter': {
    backgroundColor: 'var(--exec-mark)',
    boxShadow: 'inset 3px 0 0 var(--exec-mark-bar)',
    color: 'var(--text)',
  },
  '.jas-exec-line, .jas-phantom-row.jas-exec-line': { backgroundColor: 'var(--exec-mark)' },
  '.jas-mnemonic': { color: 'var(--syntax-mnemonic)', fontWeight: '700' },
  '.jas-register': { color: 'var(--syntax-register)', fontWeight: '700' },
  '.jas-label': { color: 'var(--syntax-label)', fontWeight: '700' },
  '.jas-constant': { color: 'var(--syntax-constant)', fontWeight: '700' },
  '.jas-variable': { color: 'var(--syntax-variable)', fontWeight: '700' },
  '.jas-comment': { color: 'var(--syntax-comment)', fontStyle: 'italic' },
  '.jas-error': {
    color: 'var(--syntax-error)',
    textDecoration: 'underline wavy var(--syntax-error)',
    textDecorationSkipInk: 'none',
    textUnderlineOffset: '2px',
  },
  '&.jas-readonly': { backgroundColor: 'var(--bg-subtle)' },
});

/**
 * The program editor (spec 02 §6): CodeMirror 6 with highlighting from the core's
 * parse results, auto-indent, the context menu, the 0-based gutter with
 * breakpoints and the execution mark, read-only while running, and the error line
 * below. Every edit is pushed to the session, which re-parses and moves the
 * breakpoints with their lines (07 Q-UI-2).
 */
@Component({
  selector: 'app-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkContextMenuTrigger, MenuPanel],
  template: `
    <div
      #host
      class="view"
      [cdkContextMenuTriggerFor]="menu"
      [style.font-family]="font()"
      [style.font-size.px]="fontSize()"
    ></div>
    <div class="error-line" role="status" aria-label="Error">{{ message() }}</div>
    <ng-template #menu><app-menu-panel label="Editor" [entries]="contextMenu" /></ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }
    .view {
      flex: 1;
      min-height: 0;
      overflow: hidden;
    }
    .error-line {
      flex: none;
      min-height: 22px;
      padding: 2px var(--space-3);
      border-top: 1px solid var(--border);
      color: var(--syntax-error);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `,
})
export class CodeEditor implements EditorHandle {
  readonly doc = input.required<DocumentStore>();
  private readonly hostRef = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly contextMenu = CONTEXT_MENU;
  protected readonly font = computed(() => fontFamily(this.settings.watch('font')()));
  protected readonly fontSize = this.settings.watch('font.size');
  /** The error line (spec 02 §6.4). */
  protected readonly message = signal('');

  private view: EditorView | null = null;
  private readonly editable = new Compartment();

  constructor() {
    afterNextRender(() => this.create());
    // Text replaced from outside the editor (e.g. a file opened into this document).
    effect(() => {
      const text = this.doc().text();
      const view = this.view;
      if (view && text !== view.state.doc.toString()) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
          annotations: Transaction.addToHistory.of(false),
        });
      }
    });
    effect(() => {
      this.font();
      this.fontSize();
      this.view?.requestMeasure();
    });
  }

  /** The CodeMirror view, for tests. */
  get editorView(): EditorView | null {
    return this.view;
  }

  private create(): void {
    const doc = this.doc();
    const host: EditorHost = {
      session: () => doc.session,
      toggleBreakpoint: (line) => {
        doc.session.toggleBreakpoint(line);
        this.refresh();
      },
      setInstructionPointer: (line) => doc.session.setInstructionPointer(line),
    };
    const view = new EditorView({
      parent: this.hostRef().nativeElement,
      state: EditorState.create({
        doc: doc.text(),
        extensions: [
          history({ minDepth: HISTORY_DEPTH, newGroupDelay: 0 }),
          keymap.of([
            { key: 'Enter', run: insertNewlineKeepIndent },
            { key: 'Tab', run: insertTabCharacter },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          this.editable.of(editableState(doc.session.running)),
          EditorView.contentAttributes.of({
            'aria-label': 'Program code',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocorrect: 'off',
          }),
          jasminEditor(host),
          editorTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged || update.selectionSet || update.focusChanged) {
              this.syncSignals(update.view);
            }
          }),
        ],
      }),
      // Push edits to the session before the view updates, so highlighting and
      // the gutter see the re-parsed program and the moved breakpoints.
      dispatchTransactions: (transactions, view) => {
        const last = transactions[transactions.length - 1];
        if (transactions.some((tr) => tr.docChanged)) doc.setText(last.state.doc.toString());
        view.update(transactions);
      },
    });
    this.view = view;
    doc.editor = this;
    const unsubscribe = doc.session.subscribe((event) => this.onSessionEvent(doc.session, event));
    this.destroyRef.onDestroy(() => {
      unsubscribe();
      if (doc.editor === this) doc.editor = null;
      view.destroy();
      this.view = null;
    });
    this.syncSignals(view);
  }

  private onSessionEvent(session: MachineSession, event: SessionEvent): void {
    const view = this.view;
    if (!view) return;
    if (event.kind === 'running') {
      view.dispatch({
        effects: [this.editable.reconfigure(editableState(event.running)), refreshEffect.of(null)],
      });
      if (!event.running) scrollToMark(view, session.dsp.getInstructionPointer());
      return;
    }
    view.dispatch({ effects: refreshEffect.of(null) });
    if (event.kind === 'refresh') {
      // Step, Execute line, Stop, Reset, Run end: their error or nothing (spec 02 §6.4).
      this.message.set(event.reset ? '' : (session.error ?? ''));
      if (!session.running) scrollToMark(view, session.dsp.getInstructionPointer());
    }
  }

  private refresh(): void {
    this.view?.dispatch({ effects: refreshEffect.of(null) });
  }

  private syncSignals(view: EditorView): void {
    const doc = this.doc();
    const { state } = view;
    const selection = state.selection.main;
    const line = state.doc.lineAt(selection.head).number - 1;
    doc.canUndo.set(undoDepth(state) > 0);
    doc.canRedo.set(redoDepth(state) > 0);
    doc.hasSelection.set(!selection.empty);
    doc.caretLine.set(line);
    // The caret's line parse error, or nothing (spec 02 §6.4).
    this.message.set(doc.session.program.result(line)?.error?.errorMsg ?? '');
  }

  // ---- EditorHandle ----

  undo(): void {
    if (this.view) undo(this.view);
    this.focus();
  }

  redo(): void {
    if (this.view) redo(this.view);
    this.focus();
  }

  copy(): void {
    const text = this.selectedText();
    if (text) void navigator.clipboard?.writeText(text).catch(() => undefined);
  }

  cut(): void {
    const view = this.view;
    if (!view || view.state.readOnly || view.state.selection.main.empty) return;
    this.copy();
    view.dispatch(view.state.replaceSelection(''), { userEvent: 'delete.cut' });
    this.focus();
  }

  paste(): void {
    void navigator.clipboard
      ?.readText()
      .then((text) => {
        const view = this.view;
        if (!view || view.state.readOnly) return;
        view.dispatch(view.state.replaceSelection(text.replace(/\r/g, '')), {
          userEvent: 'input.paste',
          scrollIntoView: true,
        });
        this.focus();
      })
      .catch(() => undefined);
  }

  focus(): void {
    this.view?.focus();
  }

  private selectedText(): string {
    const view = this.view;
    if (!view) return '';
    const { from, to } = view.state.selection.main;
    return view.state.sliceDoc(from, to);
  }
}

function editableState(running: boolean) {
  return [
    EditorView.editable.of(!running),
    EditorState.readOnly.of(running),
    EditorView.editorAttributes.of(running ? { class: 'jas-readonly' } : {}),
  ];
}
