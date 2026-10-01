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
 * The small modal dialogs of the original's `JOptionPane` (spec 02 §13): an input
 * prompt, a choice between buttons plus Cancel, and a message with OK. Built on the
 * CDK dialog, styled like our menus.
 */
@Component({
  selector: 'app-simple-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'simple-dialog' },
  template: `
    <h2 class="title" [id]="titleId">{{ data.title }}</h2>
    <p class="message" [id]="messageId">{{ data.message }}</p>
    @switch (data.kind) {
      @case ('prompt') {
        <form (submit)="$event.preventDefault(); close(field.value)">
          <input
            #field
            class="field"
            type="text"
            spellcheck="false"
            autocomplete="off"
            [attr.aria-labelledby]="messageId"
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
      max-width: 480px;
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
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .message {
      margin: 0 0 var(--space-3);
    }
    .field {
      display: block;
      width: 100%;
      margin-bottom: var(--space-3);
      padding: 5px var(--space-2);
      border: 1px solid var(--border);
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
      border: 1px solid var(--border);
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
      color: var(--bg-panel);
    }
  `,
})
export class SimpleDialog {
  protected readonly data = inject<DialogData>(DIALOG_DATA);
  private readonly ref = inject<DialogRef<DialogResult>>(DialogRef);
  private readonly fieldRef = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly id = nextId++;
  readonly titleId = `simple-dialog-title-${this.id}`;
  protected readonly messageId = `simple-dialog-message-${this.id}`;

  constructor() {
    // Like JOptionPane, the prompt starts with its initial text selected.
    afterNextRender(() => {
      if (this.data.kind === 'prompt') this.fieldRef().nativeElement.select();
    });
  }

  protected close(result?: DialogResult): void {
    this.ref.close(result);
  }
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

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

  /** A message with OK (`JOptionPane.showMessageDialog`). */
  async message(message: string): Promise<void> {
    await this.open({ kind: 'message', title: 'Message', message });
  }

  private open(data: DialogData): Promise<DialogResult | undefined> {
    const ref = this.dialog.open<DialogResult, DialogData, SimpleDialog>(SimpleDialog, {
      data,
      ariaLabel: data.message,
      ariaDescribedBy: null,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    return firstValueFrom(ref.closed);
  }
}
