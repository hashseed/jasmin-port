import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  inject,
  input,
  signal,
} from '@angular/core';
import { DocumentStore, SplitName } from '../../services/document-store';
import { SettingsService } from '../../services/settings.service';
import { PanelCard } from '../common/panel-card';
import { SplitPane } from '../common/split-pane';
import { CodeEditor } from '../editor/code-editor';
import { FpuPanel } from '../panels/fpu/fpu-panel';
import { MemoryPanel } from '../panels/memory/memory-panel';
import { FlagsPanel } from '../panels/registers/flags-panel';
import { RegistersPanel } from '../panels/registers/registers-panel';
import { BottomPane } from './bottom-pane';

/** Natural height of the FPU Registers card: header, column header and eight rows. */
const FPU_PANEL_HEIGHT = 230;

/** Below this width the document stacks its sections in one scrolling column. */
export const NARROW_QUERY = '(max-width: 799px)';

/** Default divider locations of spec 02 §5, from the container size in px. */
export const SPLIT_DEFAULTS: Record<SplitName, (size: number) => number> = {
  /** Center | Memory: the memory panel gets about 350 px. */
  split1: (width) => width - 350,
  /** Left column | rest: 300 px. */
  split2: () => 300,
  /**
   * Registers | FPU: the original gives the registers their preferred height. Ours
   * changes as rows expand, so the FPU gets its natural height instead (header
   * plus eight rows, about 230 px) and the registers the rest (about 425 px with
   * all rows collapsed); on short windows the split is at half height.
   */
  split3: (height) => Math.max(height - FPU_PANEL_HEIGHT - 3, height / 2),
  /** Editor | bottom tabs: the bottom pane gets 350 px. */
  split4: (height) => height - 350,
};

/**
 * One document tab (spec 02 §5): four nested split panes around the editor.
 * Registers with flags and FPU on the left, the editor over the bottom tabs in
 * the center, Memory on the right. On narrow screens (port addition, spec 02 §5)
 * the same sections stack in one scrolling column instead.
 */
@Component({
  selector: 'app-document-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SplitPane,
    PanelCard,
    CodeEditor,
    BottomPane,
    RegistersPanel,
    FlagsPanel,
    FpuPanel,
    MemoryPanel,
  ],
  template: `
    @let layout = doc().layout;
    @if (narrow()) {
      <div class="stack">
        <app-panel-card heading="Editor" class="editor" [headerHidden]="true">
          @defer (on immediate) {
            <app-code-editor [doc]="doc()" />
          }
        </app-panel-card>
        <app-panel-card heading="Registers" class="registers">
          <app-registers-panel [doc]="doc()" [highlight]="highlight()" />
          <app-flags-panel class="flags" [doc]="doc()" />
        </app-panel-card>
        <app-panel-card heading="Memory" class="memory">
          <app-memory-panel [doc]="doc()" [(highlight)]="highlight" />
        </app-panel-card>
        <app-panel-card heading="FPU Registers">
          <app-fpu-panel [doc]="doc()" />
        </app-panel-card>
        <app-bottom-pane class="bottom" [idPrefix]="'bottom-' + doc().id" [doc]="doc()" />
      </div>
    } @else {
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
          <app-panel-card first heading="Registers" class="registers">
            <app-registers-panel [doc]="doc()" [highlight]="highlight()" />
            <app-flags-panel class="flags" [doc]="doc()" />
          </app-panel-card>
          <app-panel-card second heading="FPU Registers">
            <app-fpu-panel [doc]="doc()" />
          </app-panel-card>
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
            <app-panel-card first heading="Editor" class="editor" [headerHidden]="true">
              @defer (on immediate) {
                <app-code-editor [doc]="doc()" />
              }
            </app-panel-card>
            <app-bottom-pane second [idPrefix]="'bottom-' + doc().id" [doc]="doc()" />
          </app-split-pane>
          <app-panel-card second heading="Memory" class="memory">
            <app-memory-panel [doc]="doc()" [(highlight)]="highlight" />
          </app-panel-card>
        </app-split-pane>
      </app-split-pane>
    }
  `,
  styles: `
    :host {
      display: flex;
      height: 100%;
      /* Card margin (3px) + this = the 9px card-divider-card gap at the window edges too. */
      padding: 6px;
    }
    .registers,
    .editor {
      flex: 1;
    }
    .editor {
      --panel-pad: 0;
    }
    /* The editor's focus indicator (CodeMirror's own outline is off). */
    .editor:focus-within {
      border-color: var(--focus-ring);
      box-shadow: 0 0 0 1px var(--focus-ring);
    }
    .registers {
      --panel-pad: var(--space-1) var(--space-3) var(--space-3);
    }
    .flags {
      margin-top: var(--space-3);
    }
    .memory {
      --panel-pad: var(--space-1) 0 0;
    }
    .stack {
      display: flex;
      flex-direction: column;
      width: 100%;
      overflow-y: auto;
    }
    .stack > * {
      flex: none;
    }
    .stack .editor {
      height: 60vh;
      min-height: 280px;
    }
    .stack .memory {
      height: 420px;
    }
    .stack .bottom {
      height: 380px;
    }
  `,
})
export class DocumentView {
  readonly doc = input.required<DocumentStore>();
  private readonly settings = inject(SettingsService);
  protected readonly defaults = SPLIT_DEFAULTS;

  /** The memory panel's `highlight` toggle, which also colors the register fields. */
  protected readonly highlight = signal(false);

  /** True on narrow screens, where the sections stack (see NARROW_QUERY). */
  protected readonly narrow = signal(false);

  constructor() {
    const media = inject(DOCUMENT).defaultView?.matchMedia?.(NARROW_QUERY);
    if (media) {
      this.narrow.set(media.matches);
      const update = (event: MediaQueryListEvent) => this.narrow.set(event.matches);
      media.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', update));
    }
  }

  protected persist(name: SplitName, location: number): void {
    this.settings.set(`${name}.location`, location);
  }
}
