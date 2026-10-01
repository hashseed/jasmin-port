import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  OnInit,
  viewChild,
} from '@angular/core';
import { DocumentStore, EditorHandle } from '../../services/document-store';

interface EditorState {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Temporary M4 editor: a monospace textarea bound to the session text, with a
 * small undo history so the Edit actions and Run/Step can be exercised. M5
 * replaces it with CodeMirror (spec 02 §6) behind the same {@link EditorHandle}.
 */
@Component({
  selector: 'app-plain-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <textarea
      #area
      class="code"
      aria-label="Program code"
      spellcheck="false"
      autocapitalize="off"
      autocomplete="off"
      [value]="doc().text()"
      [readOnly]="doc().running()"
      (input)="onInput()"
      (select)="updateCaret()"
      (keyup)="updateCaret()"
      (mouseup)="updateCaret()"
      (focus)="updateCaret()"
    ></textarea>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
    .code {
      flex: 1;
      resize: none;
      padding: var(--space-2);
      border: 0;
      background: var(--bg-panel);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: var(--font-size-mono);
      line-height: 1.5;
      tab-size: 8;
      white-space: pre;
      outline: none;
    }
    .code:read-only {
      background: var(--bg-subtle);
    }
  `,
})
export class PlainEditor implements OnInit, EditorHandle {
  readonly doc = input.required<DocumentStore>();
  private readonly area = viewChild.required<ElementRef<HTMLTextAreaElement>>('area');
  private readonly destroyRef = inject(DestroyRef);

  private undoStack: EditorState[] = [];
  private redoStack: EditorState[] = [];
  private current: EditorState = { text: '', start: 0, end: 0 };

  ngOnInit(): void {
    const doc = this.doc();
    doc.editor = this;
    this.current = { text: doc.text(), start: 0, end: 0 };
    this.destroyRef.onDestroy(() => {
      if (doc.editor === this) doc.editor = null;
    });
  }

  protected onInput(): void {
    const el = this.area().nativeElement;
    this.undoStack.push(this.current);
    this.redoStack = [];
    this.apply({ text: el.value, start: el.selectionStart, end: el.selectionEnd }, false);
  }

  protected updateCaret(): void {
    const el = this.area().nativeElement;
    const doc = this.doc();
    doc.hasSelection.set(el.selectionEnd > el.selectionStart);
    doc.caretLine.set(el.value.slice(0, el.selectionStart).split('\n').length - 1);
    this.current = { ...this.current, start: el.selectionStart, end: el.selectionEnd };
  }

  undo(): void {
    const state = this.undoStack.pop();
    if (!state) return;
    this.redoStack.push(this.current);
    this.apply(state, true);
  }

  redo(): void {
    const state = this.redoStack.pop();
    if (!state) return;
    this.undoStack.push(this.current);
    this.apply(state, true);
  }

  copy(): void {
    const el = this.area().nativeElement;
    void navigator.clipboard?.writeText(el.value.slice(el.selectionStart, el.selectionEnd));
  }

  cut(): void {
    this.copy();
    this.replaceSelection('');
  }

  paste(): void {
    void navigator.clipboard
      ?.readText()
      .then((text) => this.replaceSelection(text))
      .catch(() => undefined);
  }

  focus(): void {
    this.area().nativeElement.focus();
  }

  private replaceSelection(text: string): void {
    const el = this.area().nativeElement;
    const start = el.selectionStart;
    const value = el.value.slice(0, start) + text + el.value.slice(el.selectionEnd);
    this.undoStack.push(this.current);
    this.redoStack = [];
    this.apply({ text: value, start: start + text.length, end: start + text.length }, true);
  }

  private apply(state: EditorState, writeBack: boolean): void {
    const doc = this.doc();
    this.current = state;
    doc.setText(state.text);
    if (writeBack) {
      const el = this.area().nativeElement;
      el.value = state.text;
      el.setSelectionRange(state.start, state.end);
      el.focus();
    }
    doc.canUndo.set(this.undoStack.length > 0);
    doc.canRedo.set(this.redoStack.length > 0);
    this.updateCaret();
  }
}
