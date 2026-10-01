import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { DocumentStore } from '../../../services/document-store';
import { SegmentedControl } from '../../common/segmented-control';
import { EditCell } from '../edit-cell';
import { RADIX_OPTIONS, Radix } from '../radix';
import { registerColor } from '../register-colors';
import { RegisterView, registerViews, writeRegister } from './register-view';

/**
 * The registers panel (spec 02 §7): the format toggles and nine register rows,
 * each collapsed to one 32-bit field or expanded to four byte fields.
 */
@Component({
  selector: 'app-registers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedControl, EditCell],
  template: `
    <app-segmented-control
      class="formats"
      label="Register format"
      [options]="radixOptions"
      [(value)]="radix"
    />
    <div class="rows">
      @for (reg of registers(); track reg.name) {
        @let open = expanded().has(reg.name);
        @let color = highlight() ? colorOf(reg.name) : null;
        <div class="reg" [class.open]="open" [attr.data-register]="reg.name">
          <button
            type="button"
            class="toggle"
            [attr.aria-expanded]="open"
            [attr.aria-label]="(open ? 'Collapse ' : 'Expand ') + reg.name"
            (click)="toggle(reg.name)"
          >
            {{ open ? '▾' : '▸' }}
          </button>
          @if (!open) {
            <label class="name" [attr.for]="fieldId(reg.name)">{{ reg.name }}:</label>
            <input
              class="field"
              [id]="fieldId(reg.name)"
              [class.changed]="reg.changed"
              [style.background]="color"
              [attr.aria-label]="reg.name"
              [appEditCell]="reg.text"
              (commit)="edit(reg, $event, null)"
            />
          } @else {
            <div class="bytes">
              <span class="label e">{{ reg.name }}</span>
              <span class="label"></span>
              <span class="label x" [class.named]="reg.x">{{ reg.x }}</span>
              @for (byte of reg.bytes; track byte.index) {
                <input
                  class="field"
                  [class.changed]="byte.changed"
                  [style.background]="color"
                  [attr.aria-label]="reg.name + ' byte ' + byte.index"
                  [attr.data-byte]="byte.index"
                  [appEditCell]="byte.text"
                  (commit)="edit(reg, $event, byte.index)"
                />
              }
              <span class="label"></span>
              <span class="label"></span>
              <span class="label part" [class.named]="reg.h">{{ reg.h }}</span>
              <span class="label part" [class.named]="reg.l">{{ reg.l }}</span>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .formats {
      align-self: flex-start;
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: 3px;
    }
    .reg {
      display: grid;
      grid-template-columns: 24px 40px 1fr;
      align-items: center;
      min-height: 24px;
    }
    .reg.open {
      grid-template-columns: 24px 1fr;
      align-items: start;
    }
    /* 24 px: the minimum target size of WCAG 2.5.8. */
    .toggle {
      width: 24px;
      height: 24px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-muted);
      font-size: 11px;
      cursor: pointer;
    }
    .reg.open .toggle {
      margin-top: 14px;
    }
    .toggle:hover {
      background: var(--bg-hover);
      color: var(--text);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: -2px;
    }
    .name {
      font-family: var(--font-mono);
      color: var(--text-muted);
      white-space: pre;
    }
    .field {
      min-width: 0;
      width: 100%;
      height: 22px;
      padding: 0 var(--space-2);
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: var(--bg-subtle);
      color: var(--text);
      font-family: var(--font-mono);
      font-size: var(--font-size-mono);
      font-variant-numeric: tabular-nums;
    }
    .field:focus {
      outline: none;
      border-color: var(--focus-ring);
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--focus-ring) 25%, transparent);
    }
    .changed {
      font-weight: 700;
      animation: changed-accent 0.8s ease-out;
    }
    .bytes {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      column-gap: 3px;
    }
    .label {
      height: 15px;
      padding: 0 var(--space-1);
      font-size: 11px;
      line-height: 15px;
      color: var(--text-muted);
    }
    .label.e {
      font-weight: 600;
    }
    /* Full text color on the tinted name cells, for contrast (WCAG AA). */
    .label.named {
      color: var(--text);
    }
    .label.x {
      grid-column: span 2;
    }
    .label.x.named {
      background: var(--bg-selected);
      border-radius: var(--radius-sm) var(--radius-sm) 0 0;
    }
    .label.part.named {
      background: color-mix(in srgb, var(--pause) 22%, transparent);
      border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    }
    @keyframes changed-accent {
      from {
        color: var(--accent);
      }
    }
  `,
})
export class RegistersPanel {
  readonly doc = input.required<DocumentStore>();
  /** The memory panel's `highlight` toggle (spec 02 §10.1). */
  readonly highlight = input(false);

  protected readonly radixOptions = RADIX_OPTIONS;
  /** `±dec` is selected at start (spec 02 §7.1). */
  protected readonly radix = signal<Radix>('sdec');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly colorOf = registerColor;

  protected readonly registers = computed(() => {
    const doc = this.doc();
    doc.version();
    return registerViews(doc.session.dsp, this.radix());
  });

  protected fieldId(name: string): string {
    return `reg-${this.doc().id}-${name}`;
  }

  protected toggle(name: string): void {
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(name)) next.add(name);
      return next;
    });
  }

  protected edit(reg: RegisterView, text: string, byteIndex: number | null): void {
    const doc = this.doc();
    if (writeRegister(doc.session.dsp, reg.set, text, this.radix(), byteIndex)) {
      doc.refreshPanels();
    }
  }
}
