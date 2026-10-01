import {
  Directive,
  ElementRef,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
} from '@angular/core';

/**
 * An `<input>` that shows `appEditCell` and commits its edited text on Enter or
 * when it loses focus (the original's `ActionPerformed` / `FocusLost` pair).
 * Text that was not changed is not committed. After a commit, and on Escape,
 * the field shows the bound text again, so invalid input reverts (spec 02 §7.2).
 */
@Directive({
  selector: 'input[appEditCell]',
  host: {
    type: 'text',
    spellcheck: 'false',
    autocomplete: 'off',
    '[value]': 'appEditCell()',
    '(keydown.enter)': 'commitNow()',
    '(keydown.escape)': 'revert()',
    '(blur)': 'commitNow()',
  },
})
export class EditCell {
  readonly appEditCell = input.required<string>();
  /** The edited text; the handler writes it to the machine (or ignores it). */
  readonly commit = output<string>();

  private readonly element = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);

  protected commitNow(): void {
    const text = this.element.value;
    if (text === this.appEditCell()) return;
    this.commit.emit(text);
    // The bound text may not change (invalid input, same value written in
    // another notation): show it again once the panels have re-rendered.
    afterNextRender(() => this.revert(), { injector: this.injector });
  }

  protected revert(): void {
    this.element.value = this.appEditCell();
  }
}
