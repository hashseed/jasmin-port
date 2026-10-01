import { TestBed } from '@angular/core/testing';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DocumentStore } from '../../services/document-store';
import { frozenSessionFactory } from '../../services/test-session';
import { DEFAULT_MACHINE_CONFIG } from '../../core';
import { CodeEditor, fontFamily } from './code-editor';
import { insertNewlineKeepIndent } from './jasmin-extensions';

async function mount(text: string) {
  const session = frozenSessionFactory(DEFAULT_MACHINE_CONFIG);
  session.setText(text);
  const doc = new DocumentStore(session);
  const fixture = TestBed.createComponent(CodeEditor);
  fixture.componentRef.setInput('doc', doc);
  fixture.detectChanges();
  await fixture.whenStable();
  const view = fixture.componentInstance.editorView as EditorView;
  return { doc, session, view, fixture };
}

describe('CodeEditor', () => {
  beforeEach(() => localStorage.clear());

  it('registers as the document editor and mirrors edits into the session', async () => {
    const { doc, session, view } = await mount('nop');
    expect(doc.editor).not.toBeNull();
    view.dispatch({ changes: { from: 3, insert: '\nmov eax, 1' } });
    expect(session.program.text).toBe('nop\nmov eax, 1');
    expect(doc.canUndo()).toBe(true);
    doc.editor!.undo();
    expect(session.program.text).toBe('nop');
    expect(doc.canRedo()).toBe(true);
  });

  it('tracks the caret line and selection', async () => {
    const { doc, view } = await mount('nop\nnop\nnop');
    view.dispatch({ selection: EditorSelection.range(4, 7) });
    expect(doc.caretLine()).toBe(1);
    expect(doc.hasSelection()).toBe(true);
  });

  it('moves breakpoints with their lines (07 Q-UI-2)', async () => {
    const { session, view } = await mount('nop\nnop');
    session.toggleBreakpoint(1);
    view.dispatch({ changes: { from: 0, insert: 'mov eax, 1\n' } });
    expect(session.hasBreakpoint(1)).toBe(false);
    expect(session.hasBreakpoint(2)).toBe(true);
  });

  it('auto-indents with the leading whitespace up to the caret', async () => {
    const { view } = await mount('\t  mov eax, 1');
    view.dispatch({ selection: { anchor: view.state.doc.length } });
    insertNewlineKeepIndent(view);
    expect(view.state.doc.toString()).toBe('\t  mov eax, 1\n\t  ');
    view.dispatch({ selection: { anchor: 1 } });
    insertNewlineKeepIndent(view);
    expect(view.state.doc.line(2).text).toBe('\t  mov eax, 1');
    expect(view.state.doc.line(1).text).toBe('\t');
  });

  it('is read-only while running', async () => {
    const { doc, view, fixture } = await mount('l: jmp l');
    doc.run();
    await fixture.whenStable();
    expect(view.state.readOnly).toBe(true);
    expect(view.contentDOM.getAttribute('contenteditable')).toBe('false');
    doc.pause();
    expect(view.state.readOnly).toBe(false);
  });

  it('maps Java logical fonts', () => {
    expect(fontFamily('Sans Serif')).toBe('sans-serif');
    expect(fontFamily('Monospaced')).toBe('monospace');
    expect(fontFamily('JetBrains Mono')).toBe('var(--font-mono)');
  });
});
