import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { DocumentStore } from '../../services/document-store';
import { ConsoleView } from '../devices/console-view';
import { GraphicsView } from '../devices/graphics-view';
import { SevenSegmentView } from '../devices/seven-segment-view';
import { StripLightView } from '../devices/strip-light-view';

/** Bottom tabs of the center column, in the original order (spec 02 §5). */
export const BOTTOM_TABS = ['Help', '7-Segment', 'StripLight', 'Console', 'Graphics'] as const;
type BottomTab = (typeof BOTTOM_TABS)[number];

const MILESTONE: Record<BottomTab, string> = {
  Help: 'M6',
  '7-Segment': 'M7',
  StripLight: 'M7',
  Console: 'M7',
  Graphics: 'M7',
};

/**
 * Device tabs fill the pane edge to edge (spec 06: scaled and centered). Their
 * views (and the dialogs they use) load lazily, when a device tab is first shown.
 */
const DEVICE_TABS: ReadonlySet<BottomTab> = new Set([
  '7-Segment',
  'StripLight',
  'Console',
  'Graphics',
]);

/**
 * The bottom tab pane with its tabs on the left edge as stacked horizontal
 * labels. The device tabs show the document's I/O devices (spec 06); only the
 * selected one is rendered, while the document's DeviceSet keeps their state.
 */
@Component({
  selector: 'app-bottom-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SevenSegmentView, StripLightView, ConsoleView, GraphicsView],
  template: `
    <div class="side" role="tablist" aria-orientation="vertical" aria-label="Tools">
      @for (tab of tabs; track tab) {
        <button
          type="button"
          role="tab"
          [id]="idPrefix() + '-tab-' + $index"
          [attr.aria-selected]="tab === selected()"
          [attr.aria-controls]="idPrefix() + '-panel'"
          [class.selected]="tab === selected()"
          (click)="selected.set(tab)"
        >
          {{ tab }}
        </button>
      }
    </div>
    <div
      class="content"
      role="tabpanel"
      [id]="idPrefix() + '-panel'"
      [attr.aria-label]="selected()"
      [class.device]="deviceTabs.has(selected())"
    >
      @switch (selected()) {
        @case ('7-Segment') {
          @defer (on immediate) {
            <app-seven-segment-view [doc]="doc()" />
          }
        }
        @case ('StripLight') {
          @defer (on immediate) {
            <app-strip-light-view [doc]="doc()" />
          }
        }
        @case ('Console') {
          @defer (on immediate) {
            <app-console-view [doc]="doc()" />
          }
        }
        @case ('Graphics') {
          @defer (on immediate) {
            <app-graphics-view [doc]="doc()" />
          }
        }
        @default {
          <p class="placeholder">{{ selected() }} (placeholder · {{ milestone[selected()] }})</p>
          <p class="placeholder">No help available for current context.</p>
        }
      }
    </div>
  `,
  styles: `
    :host {
      display: flex;
      margin: 3px;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      overflow: hidden;
    }
    .side {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-1);
      border-right: 1px solid var(--border);
      background: var(--bg-subtle);
    }
    .side button {
      padding: 4px var(--space-2);
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text-muted);
      font: inherit;
      text-align: left;
      white-space: nowrap;
      cursor: pointer;
    }
    .side button:hover {
      background: var(--bg-hover);
    }
    .side button.selected {
      background: var(--bg-selected);
      color: var(--text);
      font-weight: 500;
    }
    .content {
      flex: 1;
      min-width: 0;
      overflow: auto;
      padding: var(--space-2) var(--space-3);
    }
    .content.device {
      display: flex;
      padding: 0;
      overflow: hidden;
    }
    .placeholder {
      margin: 0 0 var(--space-2);
      color: var(--text-muted);
    }
  `,
})
export class BottomPane {
  readonly idPrefix = input.required<string>();
  readonly doc = input.required<DocumentStore>();
  protected readonly deviceTabs = DEVICE_TABS;
  protected readonly tabs = BOTTOM_TABS;
  protected readonly milestone = MILESTONE;
  protected readonly selected = signal<BottomTab>('Help');
}
