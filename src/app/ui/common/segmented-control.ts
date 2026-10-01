import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  WritableSignal,
  inject,
  input,
  model,
} from '@angular/core';

/** One segment of a {@link SegmentedControl}. */
export interface SegmentOption<T> {
  readonly value: T;
  readonly label: string;
  readonly title?: string;
}

/** One independent toggle of a {@link SegmentedToggles} group. */
export interface ToggleOption {
  readonly label: string;
  readonly title?: string;
  readonly pressed: WritableSignal<boolean>;
}

const SEGMENT_STYLES = `
  :host {
    display: inline-flex;
    flex: none;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-sm);
    background: var(--bg-subtle);
  }
  button {
    min-width: 36px;
    height: 22px;
    padding: 0 var(--space-2);
    border: 0;
    border-radius: 3px;
    background: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 12px;
    white-space: nowrap;
    cursor: pointer;
  }
  button:hover {
    color: var(--text);
    background: var(--bg-hover);
  }
  button.on {
    background: var(--bg-selected);
    color: var(--text);
    font-weight: 600;
  }
  button:focus-visible {
    outline: 2px solid var(--focus-ring);
    outline-offset: -2px;
  }
`;

/**
 * Mutually exclusive toggles drawn as one segmented control (docs/plan.md,
 * "Segmented toggles"): `bin | ±dec | dec | hex`, `8 Bit | 16Bit | 32Bit`.
 * A radio group for assistive technology; arrow keys move the selection.
 */
@Component({
  selector: 'app-segmented-control',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'radiogroup', '[attr.aria-label]': 'label() || null' },
  template: `
    @for (option of options(); track option.value) {
      <button
        type="button"
        role="radio"
        [class.on]="option.value === value()"
        [attr.aria-checked]="option.value === value()"
        [attr.title]="option.title ?? null"
        [tabindex]="option.value === value() ? 0 : -1"
        (click)="value.set(option.value)"
        (keydown)="onKey($event, $index)"
      >
        {{ option.label }}
      </button>
    }
  `,
  styles: SEGMENT_STYLES,
})
export class SegmentedControl<T> {
  readonly options = input.required<readonly SegmentOption<T>[]>();
  readonly value = model.required<T>();
  readonly label = input('');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onKey(event: KeyboardEvent, index: number): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const options = this.options();
    const next = (index + step + options.length) % options.length;
    this.value.set(options[next].value);
    this.host.nativeElement.querySelectorAll('button')[next]?.focus();
  }
}

/**
 * Independent on/off toggles with the same look as {@link SegmentedControl}
 * (`desc | hex | highlight`). Each button reports its state with aria-pressed.
 */
@Component({
  selector: 'app-segmented-toggles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', '[attr.aria-label]': 'label() || null' },
  template: `
    @for (option of options(); track option.label) {
      <button
        type="button"
        [class.on]="option.pressed()"
        [attr.aria-pressed]="option.pressed()"
        [attr.title]="option.title ?? null"
        (click)="option.pressed.set(!option.pressed())"
      >
        {{ option.label }}
      </button>
    }
  `,
  styles: SEGMENT_STYLES,
})
export class SegmentedToggles {
  readonly options = input.required<readonly ToggleOption[]>();
  readonly label = input('');
}
