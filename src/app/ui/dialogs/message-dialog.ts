import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** What a message dialog shows. */
export interface MessageDialogData {
  /** The message text, shown verbatim (e.g. `Not a Jasmin memory file.`). */
  readonly message: string;
  /** The heading; `Message`, like Swing's `JOptionPane.showMessageDialog`. */
  readonly title?: string;
}

let nextDialogId = 1;

/**
 * The port's modal message box (spec 02 §13: "I/O exceptions show a modal
 * message with the exception text"), replacing `JOptionPane.showMessageDialog`.
 * The CDK container around it carries `role="alertdialog"` and the labels.
 */
@Component({
  selector: 'app-message-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="title" [id]="data.id + '-title'">{{ data.title ?? 'Message' }}</h2>
    <p class="text" [id]="data.id + '-text'">{{ data.message }}</p>
    <div class="buttons">
      <button type="button" class="ok" (click)="ref.close()">OK</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 300px;
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
    .text {
      margin: 0 0 var(--space-4);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
    }
    .ok {
      min-width: 72px;
      padding: 5px var(--space-3);
      border: 1px solid var(--accent);
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: var(--bg-panel);
      font: inherit;
      font-weight: 500;
      cursor: pointer;
    }
    .ok:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }
  `,
})
export class MessageDialog {
  protected readonly data = inject<MessageDialogData & { id: string }>(DIALOG_DATA);
  protected readonly ref = inject(DialogRef);
}

/** Opens app-styled modal dialogs (Angular CDK dialog). */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly dialog = inject(Dialog);

  /** Shows `message` with an OK button; resolves when the dialog is closed. */
  async message(message: string, title?: string): Promise<void> {
    const id = `message-dialog-${nextDialogId++}`;
    const ref = this.dialog.open<void, MessageDialogData & { id: string }>(MessageDialog, {
      data: { message, title, id },
      role: 'alertdialog',
      ariaModal: true,
      ariaLabelledBy: `${id}-title`,
      ariaDescribedBy: `${id}-text`,
      hasBackdrop: true,
      autoFocus: 'first-tabbable',
      restoreFocus: true,
    });
    await firstValueFrom(ref.closed);
  }
}
