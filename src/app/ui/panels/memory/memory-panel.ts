import {
  CdkVirtualScrollViewport,
  ScrollingModule,
  VIRTUAL_SCROLL_STRATEGY,
} from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { DocumentStore } from '../../../services/document-store';
import { inViewport, liveVersion } from '../../common/in-viewport';
import { SegmentedControl, SegmentedToggles, ToggleOption } from '../../common/segmented-control';
import { EditCell } from '../edit-cell';
import { MemoryColumn, formatAddress } from '../radix';
import { CellWidth, WIDTH_OPTIONS, memoryRowCount, memoryRows, writeMemory } from './memory-view';
import { RowScrollStrategy } from './row-scroll-strategy';

/** Height of one table row in px. */
export const MEMORY_ROW_HEIGHT = 20;

/**
 * The memory panel (spec 02 §10): the `desc | hex | highlight` toggles, the cell
 * width, and a virtualized table of `memorySize / width` rows that stays smooth
 * at megabytes of memory. Value cells are editable.
 */
@Component({
  selector: 'app-memory-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.running]': 'doc().running()' },
  imports: [ScrollingModule, SegmentedControl, SegmentedToggles, EditCell],
  providers: [
    {
      provide: VIRTUAL_SCROLL_STRATEGY,
      useFactory: () => new RowScrollStrategy(MEMORY_ROW_HEIGHT),
    },
  ],
  template: `
    <div class="toolbar">
      <app-segmented-toggles label="Memory view" [options]="toggles" />
      <span class="spacer"></span>
      <app-segmented-control
        label="Cell width"
        [options]="widthOptions"
        [value]="width()"
        (valueChange)="setWidth($event)"
      />
    </div>
    <div
      class="table"
      role="table"
      aria-label="Memory cells"
      [attr.aria-rowcount]="rowCount() + 1"
      [style.--columns]="columns()"
    >
      <div class="row head" role="row" [style.padding-right.px]="gutter()">
        <span role="columnheader">address</span>
        <span role="columnheader">signed int</span>
        <span role="columnheader">unsigned int</span>
        <span role="columnheader">hex</span>
      </div>
      <cdk-virtual-scroll-viewport class="body">
        @for (row of rows(); track row.address) {
          <div
            class="row"
            role="row"
            [class.changed]="row.changed"
            [class.stack]="row.stack"
            [class.colored]="row.color !== null"
            [style.background]="row.color"
            [attr.data-address]="row.address"
          >
            <span role="rowheader" class="address">{{ row.addressText }}</span>
            <span role="cell">
              <input
                [attr.aria-label]="'signed int at ' + row.addressText"
                [appEditCell]="row.signed"
                (commit)="edit(row.address, 'signed', $event)"
              />
            </span>
            <span role="cell">
              <input
                [attr.aria-label]="'unsigned int at ' + row.addressText"
                [appEditCell]="row.unsigned"
                (commit)="edit(row.address, 'unsigned', $event)"
              />
            </span>
            <span role="cell">
              <input
                [attr.aria-label]="'hex at ' + row.addressText"
                [appEditCell]="row.hex"
                (commit)="edit(row.address, 'hex', $event)"
              />
            </span>
          </div>
        }
      </cdk-virtual-scroll-viewport>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      gap: var(--space-2);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding: 0 var(--space-2);
    }
    .spacer {
      flex: 1;
    }
    .table {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      font-family: var(--font-mono);
      font-size: var(--font-size-mono);
      font-variant-numeric: tabular-nums;
    }
    .body {
      flex: 1;
      min-height: 0;
    }
    .row {
      display: grid;
      grid-template-columns: var(--columns);
      align-items: center;
      height: ${MEMORY_ROW_HEIGHT}px;
      padding: 0 0 0 var(--space-2);
    }
    .row > * {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .head {
      border-bottom: 1px solid var(--border);
    }
    .head > * {
      padding-left: 3px;
      color: var(--text-muted);
      font-family: var(--font-ui);
      font-size: 11px;
      font-weight: 500;
    }
    .stack {
      background: var(--stack-row);
    }
    .changed {
      font-weight: 700;
      animation: changed-accent 0.8s ease-out;
    }
    /* No accent while Run refreshes the panel live: it would repaint every frame. */
    :host(.running) .changed {
      animation: none;
    }
    .address {
      color: var(--text-muted);
    }
    /* Full text color on tinted rows, for contrast (WCAG AA). */
    .changed .address,
    .stack .address,
    .colored .address {
      color: var(--text);
    }
    input {
      width: 100%;
      height: 18px;
      padding: 0 2px;
      border: 1px solid transparent;
      border-radius: var(--radius-sm);
      background: none;
      color: inherit;
      font: inherit;
    }
    input:hover {
      border-color: var(--border);
    }
    input:focus {
      outline: none;
      border-color: var(--focus-ring);
      background: var(--bg-panel);
    }
    @keyframes changed-accent {
      from {
        color: var(--accent);
      }
    }
  `,
})
export class MemoryPanel {
  readonly doc = input.required<DocumentStore>();
  /** The `highlight` toggle, shared with the registers panel (spec 02 §7.2). */
  readonly highlight = model(false);
  /** The document's version; out of view, live refreshes are skipped. */
  private readonly version = liveVersion(this.doc, inViewport());

  private readonly strategy = inject(VIRTUAL_SCROLL_STRATEGY) as RowScrollStrategy;
  private readonly viewport = viewChild.required(CdkVirtualScrollViewport);

  protected readonly widthOptions = WIDTH_OPTIONS;
  protected readonly width = signal<CellWidth>(4);
  private readonly descending = signal(false);
  private readonly hexAddress = signal(true);
  protected readonly toggles: readonly ToggleOption[] = [
    { label: 'desc', title: 'Show cells in descending order', pressed: this.descending },
    { label: 'hex', title: 'Show addresses as hex numbers', pressed: this.hexAddress },
    {
      label: 'highlight',
      title: 'Highlight cells that registers are pointing to',
      pressed: this.highlight,
    },
  ];
  /** Width of the body's scrollbar, so the header columns line up. */
  protected readonly gutter = signal(0);

  protected readonly rowCount = computed(() => {
    const doc = this.doc();
    this.version();
    return memoryRowCount(doc.session.dsp, this.width());
  });

  /**
   * Column widths: the address and hex columns fit their longest text (in `ch`
   * of the monospace font), the two decimal columns share the rest.
   */
  protected readonly columns = computed(() => {
    const doc = this.doc();
    this.version();
    const dsp = doc.session.dsp;
    const last = dsp.offset + dsp.memorySize - 1;
    const address = formatAddress(last, this.hexAddress()).length;
    const hex = 2 * this.width() + 2;
    return `calc(${Math.max(address, 5)}ch + 12px) minmax(0, 1fr) minmax(0, 1fr) calc(${hex}ch + 8px)`;
  });

  protected readonly rows = computed(() => {
    const doc = this.doc();
    this.version();
    const { start, end } = this.strategy.window();
    return memoryRows(doc.session.dsp, start, end, {
      width: this.width(),
      descending: this.descending(),
      hexAddress: this.hexAddress(),
      highlight: this.highlight(),
    });
  });

  constructor() {
    effect(() => this.strategy.setRowCount(this.rowCount()));
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') return;
      const viewport = this.viewport();
      const element = viewport.elementRef.nativeElement;
      const observer = new ResizeObserver(() => {
        viewport.checkViewportSize();
        this.gutter.set(element.offsetWidth - element.clientWidth);
      });
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  /** Selecting a cell width also scrolls the table to the top (spec 02 §10.1). */
  protected setWidth(width: CellWidth): void {
    this.width.set(width);
    this.viewport().scrollToOffset(0);
  }

  protected edit(address: number, column: MemoryColumn, text: string): void {
    const doc = this.doc();
    if (writeMemory(doc.session.dsp, address, this.width(), column, text)) doc.refreshPanels();
  }
}
