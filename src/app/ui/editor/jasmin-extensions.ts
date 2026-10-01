import {
  EditorSelection,
  Extension,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state';
import {
  BlockInfo,
  BlockType,
  Command,
  Decoration,
  DecorationSet,
  EditorView,
  GutterMarker,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  gutter,
} from '@codemirror/view';
import { MachineSession } from '../../core';
import { LabelKind, highlightLine } from './highlight';

/**
 * Dispatched whenever the session changed outside the editor (Step, Run, Reset,
 * breakpoints, EIP): re-reads highlights, breakpoints and the execution mark.
 */
export const refreshEffect = StateEffect.define<null>();

/** Sets how many empty gutter rows follow the last line (spec 02 §6.2). */
const setPhantomRows = StateEffect.define<number>();

/** What the editor extensions read from the document's machine. */
export interface EditorHost {
  /** The live session; its program and DataSpace may be replaced (Load Memory). */
  session(): MachineSession;
  toggleBreakpoint(line: number): void;
  setInstructionPointer(line: number): void;
}

// ---------------------------------------------------------------------------
// Auto-indent (spec 02 §6.1)

/**
 * Enter: inserts a line break followed by the leading spaces/tabs of the current
 * line, up to the caret column.
 */
export const insertNewlineKeepIndent: Command = (view) => {
  if (view.state.readOnly) return false;
  const { state } = view;
  const tr = state.changeByRange((range) => {
    const line = state.doc.lineAt(range.from);
    const indent = /^[ \t]*/.exec(line.text)![0].slice(0, range.from - line.from);
    const insert = '\n' + indent;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.cursor(range.from + insert.length),
    };
  });
  view.dispatch(state.update(tr, { scrollIntoView: true, userEvent: 'input' }));
  return true;
};

/** Tab inserts a tab character, as in the original text pane. */
export const insertTabCharacter: Command = (view) => {
  if (view.state.readOnly) return false;
  view.dispatch(view.state.replaceSelection('\t'), { scrollIntoView: true, userEvent: 'input' });
  return true;
};

// ---------------------------------------------------------------------------
// Syntax highlighting (spec 02 §6.3)

const markCache = new Map<string, Decoration>();
function markFor(style: string): Decoration {
  let mark = markCache.get(style);
  if (!mark) {
    mark = Decoration.mark({ class: `jas-${style}` });
    markCache.set(style, mark);
  }
  return mark;
}

function labelKind(session: MachineSession, label: string): LabelKind {
  if (session.dsp.isConstant(label)) return 'constant';
  if (session.dsp.isVariable(label)) return 'variable';
  return 'label';
}

function buildHighlights(view: EditorView, host: EditorHost): DecorationSet {
  const session = host.session();
  const program = session.program;
  const kindOf = (label: string) => labelKind(session, label);
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    const last = doc.lineAt(to).number;
    for (let n = doc.lineAt(from).number; n <= last; n++) {
      const line = doc.line(n);
      // The session parses the same text; skip a line in the instant they differ.
      if (program.line(n - 1) !== line.text) continue;
      for (const run of highlightLine(line.text, program.result(n - 1), kindOf)) {
        builder.add(line.from + run.from, line.from + run.to, markFor(run.style));
      }
    }
  }
  return builder.finish();
}

function isRefresh(update: ViewUpdate): boolean {
  return update.transactions.some((tr) => tr.effects.some((e) => e.is(refreshEffect)));
}

function highlighter(host: EditorHost): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildHighlights(view, host);
      }
      update(update: ViewUpdate): void {
        if (update.docChanged || update.viewportChanged || isRefresh(update)) {
          this.decorations = buildHighlights(update.view, host);
        }
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// ---------------------------------------------------------------------------
// Execution mark and empty rows below the text (spec 02 §6.2)

/** The empty rows after the last line: numbered in the gutter, blank in the text. */
class PhantomRows extends WidgetType {
  constructor(
    readonly first: number,
    readonly count: number,
    readonly mark: number,
  ) {
    super();
  }

  override eq(other: PhantomRows): boolean {
    return other.first === this.first && other.count === this.count && other.mark === this.mark;
  }

  toDOM(): HTMLElement {
    const box = document.createElement('div');
    box.className = 'jas-phantom';
    box.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.count; i++) {
      const row = document.createElement('div');
      row.className = 'jas-phantom-row';
      if (this.first + i === this.mark) row.classList.add('jas-exec-line');
      row.textContent = '​';
      box.appendChild(row);
    }
    return box;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

interface MarkState {
  readonly phantomRows: number;
  readonly decorations: DecorationSet;
}

const execLine = Decoration.line({ class: 'jas-exec-line' });

function markField(host: EditorHost): StateField<MarkState> {
  const build = (
    doc: { lines: number; length: number; line(n: number): { from: number } },
    rows: number,
  ) => {
    const eip = host.session().dsp.getInstructionPointer();
    const builder = new RangeSetBuilder<Decoration>();
    if (eip >= 0 && eip < doc.lines)
      builder.add(doc.line(eip + 1).from, doc.line(eip + 1).from, execLine);
    if (rows > 0) {
      builder.add(
        doc.length,
        doc.length,
        Decoration.widget({ widget: new PhantomRows(doc.lines, rows, eip), block: true, side: 1 }),
      );
    }
    return builder.finish();
  };
  return StateField.define<MarkState>({
    create: (state) => ({ phantomRows: 1, decorations: build(state.doc, 1) }),
    update(value, tr) {
      let rows = value.phantomRows;
      let changed = tr.docChanged;
      for (const effect of tr.effects) {
        if (effect.is(setPhantomRows) && effect.value !== rows) {
          rows = effect.value;
          changed = true;
        } else if (effect.is(refreshEffect)) {
          changed = true;
        }
      }
      return changed ? { phantomRows: rows, decorations: build(tr.state.doc, rows) } : value;
    },
    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
}

/**
 * Keeps enough empty rows after the text to fill the viewport, plus at least one
 * so the mark stays visible when the program ran past the last line.
 */
function phantomRowSizer(field: StateField<MarkState>): Extension {
  return ViewPlugin.fromClass(
    class {
      constructor(readonly view: EditorView) {
        this.measure();
      }
      update(update: ViewUpdate): void {
        if (update.geometryChanged || update.docChanged || update.heightChanged) this.measure();
      }
      private measure(): void {
        this.view.requestMeasure({
          key: this,
          read: (view) => {
            const lineHeight = view.defaultLineHeight;
            const visible = Math.floor(view.scrollDOM.clientHeight / lineHeight);
            return Math.max(1, visible - view.state.doc.lines);
          },
          write: (rows, view) => {
            if (rows !== view.state.field(field).phantomRows) {
              queueMicrotask(() => {
                if (rows !== view.state.field(field).phantomRows) {
                  view.dispatch({ effects: setPhantomRows.of(rows) });
                }
              });
            }
          },
        });
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Gutter (spec 02 §6.2)

class RowMarker extends GutterMarker {
  constructor(
    readonly row: number,
    readonly breakpoint: boolean,
    readonly marked: boolean,
  ) {
    super();
    this.elementClass = marked ? 'jas-exec-gutter' : '';
  }

  override eq(other: RowMarker): boolean {
    return (
      other.row === this.row && other.breakpoint === this.breakpoint && other.marked === this.marked
    );
  }

  override toDOM(): Node {
    return renderRow(this.row, this.breakpoint, this.marked);
  }
}

function renderRow(row: number, breakpoint: boolean, marked: boolean): HTMLElement {
  const el = document.createElement('div');
  el.className = 'jas-row';
  el.dataset['row'] = String(row);
  if (breakpoint) el.classList.add('jas-has-breakpoint');
  if (marked) el.classList.add('jas-exec-row');
  const dot = document.createElement('span');
  dot.className = 'jas-breakpoint';
  const number = document.createElement('span');
  number.className = 'jas-number';
  number.textContent = String(row);
  el.append(dot, number);
  return el;
}

/** Reserves the gutter width for three-digit numbers without being a row. */
class SpacerMarker extends GutterMarker {
  override eq(): boolean {
    return true;
  }

  override toDOM(): Node {
    const el = renderRow(999, false, false);
    delete el.dataset['row'];
    return el;
  }
}

class PhantomMarker extends GutterMarker {
  constructor(readonly widget: PhantomRows) {
    super();
  }

  override eq(other: PhantomMarker): boolean {
    return this.widget.eq(other.widget);
  }

  override toDOM(): Node {
    const box = document.createElement('div');
    for (let i = 0; i < this.widget.count; i++) {
      const row = this.widget.first + i;
      box.appendChild(renderRow(row, false, row === this.widget.mark));
    }
    return box;
  }
}

/** The row index (line number from 0, continuing into the empty rows) at `clientY`. */
export function rowAtHeight(view: EditorView, clientY: number): number {
  const y = clientY - view.documentTop;
  const block = view.lineBlockAtHeight(y);
  const line = view.state.doc.lineAt(block.from).number - 1;
  const text: BlockInfo = Array.isArray(block.type)
    ? ((block.type as readonly BlockInfo[]).find((b) => b.type === BlockType.Text) ?? block)
    : block;
  if (line === view.state.doc.lines - 1 && y >= text.bottom) {
    return view.state.doc.lines + Math.floor((y - text.bottom) / view.defaultLineHeight);
  }
  return line;
}

function rowGutter(host: EditorHost): Extension {
  return gutter({
    class: 'jas-gutter',
    lineMarker(view, line) {
      const row = view.state.doc.lineAt(line.from).number - 1;
      const session = host.session();
      return new RowMarker(
        row,
        session.hasBreakpoint(row),
        session.dsp.getInstructionPointer() === row,
      );
    },
    widgetMarker: (_view, widget) =>
      widget instanceof PhantomRows ? new PhantomMarker(widget) : null,
    lineMarkerChange: (update) => update.docChanged || isRefresh(update),
    initialSpacer: () => new SpacerMarker(),
    domEventHandlers: {
      mousedown(view, _line, event) {
        const mouse = event as MouseEvent;
        if (mouse.button !== 0) return false;
        host.toggleBreakpoint(rowAtHeight(view, mouse.clientY));
        return true;
      },
      contextmenu(view, _line, event) {
        const mouse = event as MouseEvent;
        mouse.preventDefault();
        // Keep the editor's context menu (on the host element) from opening.
        mouse.stopPropagation();
        host.setInstructionPointer(rowAtHeight(view, mouse.clientY));
        return true;
      },
    },
  });
}

/** Scrolls so the execution mark is visible (spec 02 §6.2). */
export function scrollToMark(view: EditorView, eip: number): void {
  const doc = view.state.doc;
  const pos = eip >= 0 && eip < doc.lines ? doc.line(eip + 1).from : doc.length;
  view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'nearest' }) });
}

/** Highlighting, gutter, execution mark and empty rows, all read from `host`. */
export function jasminEditor(host: EditorHost): Extension {
  const marks = markField(host);
  return [marks, phantomRowSizer(marks), highlighter(host), rowGutter(host)];
}
