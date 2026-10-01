import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injectable,
  afterNextRender,
  inject,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface DialogData {
  readonly kind: 'prompt' | 'choice' | 'message';
  readonly id: string;
  readonly title: string;
  readonly message: string;
  /** prompt: the initial text. */
  readonly value?: string;
  /** choice: the option buttons (Cancel is added). */
  readonly options?: readonly string[];
}

/** prompt: the text; choice: the option index; message: true. Undefined = cancelled. */
type DialogResult = string | number | true;

let nextId = 1;

/**
 * The app's one modal dialog, replacing Swing's `JOptionPane` (spec 02 §13): a
 * message with OK (I/O errors, `Not a Jasmin memory file.`, device validation), an
 * input prompt, and a choice between buttons plus Cancel (device menus, spec 06).
 * Texts are passed in verbatim. The CDK container carries the role and labels: the
 * dialog is named by its message, so assistive technology reads the question.
 */
@Component({
  selector: 'app-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title">{{ data.title }}</h2>
    <p class="message" [id]="data.id + '-message'">{{ data.message }}</p>
    @switch (data.kind) {
      @case ('prompt') {
        <form (submit)="$event.preventDefault(); close(field.value)">
          <input
            #field
            class="field"
            type="text"
            spellcheck="false"
            autocomplete="off"
            [attr.aria-labelledby]="data.id + '-message'"
            [value]="data.value ?? ''"
          />
          <div class="buttons">
            <button type="submit" class="button primary">OK</button>
            <button type="button" class="button" (click)="close()">Cancel</button>
          </div>
        </form>
      }
      @case ('choice') {
        <div class="buttons">
          @for (option of data.options; track $index) {
            <button type="button" class="button" (click)="close($index)">{{ option }}</button>
          }
          <button type="button" class="button" (click)="close()">Cancel</button>
        </div>
      }
      @case ('message') {
        <div class="buttons">
          <button type="button" class="button primary" (click)="close(true)">OK</button>
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 320px;
      max-width: min(480px, calc(100vw - 32px));
      padding: var(--space-4);
      background: var(--bg-panel);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      box-shadow: 0 12px 32px rgb(0 0 0 / 20%);
      font-family: var(--font-ui);
      font-size: var(--font-size-ui);
    }
    .title {
      margin: 0 0 var(--space-2);
      font-size: 14px;
      font-weight: 600;
    }
    .message {
      margin: 0 0 var(--space-4);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .field {
      display: block;
      width: 100%;
      margin-bottom: var(--space-3);
      padding: 5px var(--space-2);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: var(--font-size-mono);
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .button {
      min-width: 72px;
      padding: 5px var(--space-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-sm);
      background: var(--bg-panel);
      color: var(--text);
      font: inherit;
      cursor: pointer;
    }
    .button:hover {
      background: var(--bg-hover);
    }
    .button.primary {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--on-accent);
      font-weight: 500;
    }
    .button:focus-visible,
    .field:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  `,
})
export class AppDialog {
  protected readonly data = inject<DialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<DialogResult>>(DialogRef);
  private readonly fieldRef = viewChild<ElementRef<HTMLInputElement>>('field');

  constructor() {
    // Like JOptionPane, the prompt starts with its initial text selected.
    afterNextRender(() => this.fieldRef()?.nativeElement.select());
  }

  protected close(result?: DialogResult): void {
    this.ref.close(result);
  }
}

/** Opens the app's modal dialogs (Angular CDK dialog). */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  /** A message with OK (`JOptionPane.showMessageDialog`); resolves when closed. */
  async message(message: string, title = 'Message'): Promise<void> {
    await this.open({ kind: 'message', title, message });
  }

  /** An input dialog (`JOptionPane.showInputDialog`); resolves to null when cancelled. */
  async prompt(message: string, value: string): Promise<string | null> {
    const result = await this.open({ kind: 'prompt', title: 'Input', message, value });
    return typeof result === 'string' ? result : null;
  }

  /**
   * A choice dialog (`JOptionPane.showOptionDialog`) with the options plus Cancel;
   * resolves to the chosen index, or null when cancelled.
   */
  async choose(
    message: string,
    options: readonly string[],
    title = 'Please choose',
  ): Promise<number | null> {
    const result = await this.open({ kind: 'choice', title, message, options });
    return typeof result === 'number' ? result : null;
  }

  private open(data: Omit<DialogData, 'id'>): Promise<DialogResult | undefined> {
    const id = `app-dialog-${nextId++}`;
    const ref = this.dialog.open<DialogResult, DialogData, AppDialog>(AppDialog, {
      data: { ...data, id },
      role: data.kind === 'message' ? 'alertdialog' : 'dialog',
      ariaModal: true,
      ariaLabelledBy: `${id}-message`,
      ariaDescribedBy: null,
      hasBackdrop: true,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    return firstValueFrom(ref.closed);
  }
}
