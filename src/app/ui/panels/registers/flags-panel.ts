import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FlagState } from '../../../core';
import { DocumentStore } from '../../../services/document-store';
import { inViewport, liveVersion } from '../../common/in-viewport';

type FlagKey = keyof FlagState;

/** The checkboxes in spec order (row-major, two per row) with their labels (spec 02 §8). */
export const FLAG_CHECKBOXES: readonly { readonly flag: FlagKey; readonly label: string }[] = [
  { flag: 'CF', label: 'Carry' },
  { flag: 'OF', label: 'Overflow' },
  { flag: 'SF', label: 'Sign' },
  { flag: 'ZF', label: 'Zero' },
  { flag: 'PF', label: 'Parity' },
  { flag: 'AF', label: 'Auxiliary' },
  { flag: 'TF', label: 'Trap' },
  { flag: 'DF', label: 'Direction' },
];

/** The 4x2 flag checkboxes below the register rows; clicking one sets the flag at once. */
@Component({
  selector: 'app-flags-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'group', 'aria-label': 'Flags' },
  template: `
    @for (item of flags(); track item.flag) {
      <label class="flag" [attr.data-flag]="item.flag">
        <input type="checkbox" [checked]="item.set" (change)="set(item.flag, $event)" />
        <span>{{ item.label }}</span>
      </label>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 2px var(--space-3);
    }
    .flag {
      display: flex;
      align-items: center;
      gap: 6px;
      height: 22px;
      cursor: pointer;
    }
    input {
      margin: 0;
      accent-color: var(--accent);
    }
  `,
})
export class FlagsPanel {
  readonly doc = input.required<DocumentStore>();
  /** The document's version; out of view, live refreshes are skipped. */
  private readonly version = liveVersion(this.doc, inViewport());

  protected readonly flags = computed(() => {
    const doc = this.doc();
    this.version();
    const state = doc.session.dsp.flags;
    return FLAG_CHECKBOXES.map((item) => ({ ...item, set: state[item.flag] }));
  });

  protected set(flag: FlagKey, event: Event): void {
    const doc = this.doc();
    const dsp = doc.session.dsp;
    dsp.setFlags({ ...dsp.flags, [flag]: (event.target as HTMLInputElement).checked });
    doc.refreshPanels();
  }
}
