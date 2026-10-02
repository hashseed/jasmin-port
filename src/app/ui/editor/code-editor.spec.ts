import { TestBed } from '@angular/core/testing';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DocumentStore } from '../../services/document-store';
import { frozenSessionFactory, handSession } from '../../services/test-session';
import { FakeIntersectionObserver } from '../common/test-viewport';
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

  describe('while running', () => {
    beforeEach(() => FakeIntersectionObserver.install());
    afterEach(() => FakeIntersectionObserver.uninstall());

    /** The zero-based line with the execution mark, or -1. */
    const markedLine = (view: EditorView) =>
      [...view.contentDOM.querySelectorAll('.cm-line')].findIndex((line) =>
        line.classList.contains('jas-exec-line'),
      );

    it('moves the execution mark live, and only while visible', async () => {
      const { session, scheduler } = handSession('top: inc eax\ninc ebx\njmp top');
      const doc = new DocumentStore(session);
      const fixture = TestBed.createComponent(CodeEditor);
      fixture.componentRef.setInput('doc', doc);
      await fixture.whenStable();
      const view = fixture.componentInstance.editorView as EditorView;
      const eip = () => session.dsp.getInstructionPointer();
      /** Runs slices until Run stops at a line other than the marked one, then a frame. */
      const moveRun = () => {
        const from = markedLine(view);
        do scheduler.slice();
        while (eip() === from);
        scheduler.frame();
      };

      doc.run();
      moveRun();
      expect(markedLine(view)).toBe(eip());

      FakeIntersectionObserver.show(false);
      await fixture.whenStable();
      const hidden = markedLine(view);
      moveRun();
      expect(eip()).not.toBe(hidden);
      expect(markedLine(view)).toBe(hidden);

      FakeIntersectionObserver.show(true);
      await fixture.whenStable();
      expect(markedLine(view)).toBe(eip());

      FakeIntersectionObserver.show(false);
      moveRun();
      doc.pause();
      expect(markedLine(view)).toBe(eip());
    });
  });

  it('maps Java logical fonts', () => {
    expect(fontFamily('Sans Serif')).toBe('sans-serif');
    expect(fontFamily('Monospaced')).toBe('monospace');
    expect(fontFamily('JetBrains Mono')).toBe('var(--font-mono)');
  });
});
