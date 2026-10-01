import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { FLAG_NAMES, REGISTER_NAMES } from '../../core';
import { DocumentStore, SplitName } from '../../services/document-store';
import { SettingsService } from '../../services/settings.service';
import { PanelCard } from '../common/panel-card';
import { SplitPane } from '../common/split-pane';
import { CodeEditor } from '../editor/code-editor';
import { BottomPane } from './bottom-pane';

/** Default divider locations of spec 02 §5, from the container size in px. */
export const SPLIT_DEFAULTS: Record<SplitName, (size: number) => number> = {
  /** Center | Memory: the memory panel gets about 350 px. */
  split1: (width) => width - 350,
  /** Left column | rest: 300 px. */
  split2: () => 300,
  /** Registers | FPU: the original uses the registers' preferred height; we leave the FPU 210 px. */
  split3: (height) => Math.max(height - 210, height / 2),
  /** Editor | bottom tabs: the bottom pane gets 350 px. */
  split4: (height) => height - 350,
};

/**
 * One document tab (spec 02 §5): four nested split panes around the editor.
 * Registers, Flags, FPU, Memory and the bottom tabs are M4 placeholders; the
 * register readout is live so Step and Run can be followed.
 */
@Component({
  selector: 'app-document-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SplitPane, PanelCard, CodeEditor, BottomPane],
  template: `
    @let layout = doc().layout;
    <app-split-pane
      direction="row"
      label="Resize left column"
      data-split="split2"
      [(position)]="layout.split2"
      [defaultPosition]="defaults.split2"
      (committed)="persist('split2', $event)"
    >
      <app-split-pane
        first
        direction="column"
        label="Resize registers and FPU"
        data-split="split3"
        [(position)]="layout.split3"
        [defaultPosition]="defaults.split3"
        (committed)="persist('split3', $event)"
      >
        <div first class="stack">
          <app-panel-card heading="Registers" milestone="M5" class="registers">
            <dl class="readout">
              @for (reg of registers(); track reg.name) {
                <dt>{{ reg.name }}:</dt>
                <dd>{{ reg.value }}</dd>
              }
            </dl>
          </app-panel-card>
          <app-panel-card heading="Flags" milestone="M5">
            <ul class="flags">
              @for (flag of flags(); track flag.name) {
                <li [class.set]="flag.set">{{ flag.name }} {{ flag.set ? 1 : 0 }}</li>
              }
            </ul>
          </app-panel-card>
        </div>
        <app-panel-card second heading="FPU Registers" milestone="M5" />
      </app-split-pane>

      <app-split-pane
        second
        direction="row"
        label="Resize memory panel"
        data-split="split1"
        [(position)]="layout.split1"
        [defaultPosition]="defaults.split1"
        (committed)="persist('split1', $event)"
      >
        <app-split-pane
          first
          direction="column"
          label="Resize editor and bottom tabs"
          data-split="split4"
          [(position)]="layout.split4"
          [defaultPosition]="defaults.split4"
          (committed)="persist('split4', $event)"
        >
          <app-panel-card first heading="Editor" class="editor">
            @defer (on immediate) {
              <app-code-editor [doc]="doc()" />
            }
          </app-panel-card>
          <app-bottom-pane second [idPrefix]="'bottom-' + doc().id" />
        </app-split-pane>
        <app-panel-card second heading="Memory" milestone="M5" />
      </app-split-pane>
    </app-split-pane>
  `,
  styles: `
    :host {
      display: flex;
      height: 100%;
      padding: 3px;
    }
    .stack {
      display: flex;
      flex-direction: column;
    }
    .registers,
    .editor {
      flex: 1;
    }
    .editor {
      --panel-pad: 0;
    }
    .readout {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 2px var(--space-2);
      margin: 0;
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }
    dt {
      color: var(--text-muted);
    }
    dd {
      margin: 0;
    }
    .flags {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin: 0;
      padding: 0;
      list-style: none;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }
    .flags .set {
      color: var(--text);
      font-weight: 600;
    }
  `,
})
export class DocumentView {
  readonly doc = input.required<DocumentStore>();
  private readonly settings = inject(SettingsService);
  protected readonly defaults = SPLIT_DEFAULTS;

  protected readonly registers = computed(() => {
    const doc = this.doc();
    doc.version();
    const dsp = doc.session.dsp;
    return REGISTER_NAMES.map((name) => {
      const address = dsp.getRegisterArgument(name);
      return { name, value: address ? dsp.registers.get(address) | 0 : 0 };
    });
  });

  protected readonly flags = computed(() => {
    const doc = this.doc();
    doc.version();
    const state = doc.session.dsp.flags;
    return FLAG_NAMES.map((name) => ({ name, set: state[name] }));
  });

  protected persist(name: SplitName, location: number): void {
    this.settings.set(`${name}.location`, location);
  }
}
