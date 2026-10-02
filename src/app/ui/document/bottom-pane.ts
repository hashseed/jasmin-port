import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { DocumentStore } from '../../services/document-store';
import { ConsoleView } from '../devices/console-view';
import { GraphicsView } from '../devices/graphics-view';
import { SevenSegmentView } from '../devices/seven-segment-view';
import { StripLightView } from '../devices/strip-light-view';
import { ContextHelp } from '../help/context-help';
import { rovingIndex } from '../common/roving-focus';

/** Bottom tabs of the center column, in the original order (spec 02 §5). */
export const BOTTOM_TABS = ['Help', '7-Segment', 'StripLight', 'Console', 'Graphics'] as const;
type BottomTab = (typeof BOTTOM_TABS)[number];

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
 * labels. `Help` is the context help pane (spec 02 §11); the device tabs show the
 * document's I/O devices (spec 06). Only the selected one is rendered, while the
 * document's DeviceSet keeps their state.
 */
@Component({
  selector: 'app-bottom-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ContextHelp, SevenSegmentView, StripLightView, ConsoleView, GraphicsView],
  template: `
    <div class="side" role="tablist" aria-orientation="vertical" aria-label="Tools">
      @for (tab of tabs; track tab) {
        <button
          type="button"
          role="tab"
          [id]="idPrefix() + '-tab-' + $index"
          [attr.aria-selected]="tab === selected()"
          [attr.aria-controls]="idPrefix() + '-panel'"
          [tabindex]="tab === selected() ? 0 : -1"
          [class.selected]="tab === selected()"
          (click)="doc().bottomTab.set(tab)"
          (keydown)="onKey($event)"
        >
          {{ tab }}
        </button>
      }
    </div>
    <div
      class="content"
      role="tabpanel"
      tabindex="0"
      [id]="idPrefix() + '-panel'"
      [attr.aria-labelledby]="idPrefix() + '-tab-' + tabs.indexOf(selected())"
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
          @defer (on immediate) {
            <app-context-help [doc]="doc()" />
          }
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
  `,
})
export class BottomPane {
  readonly idPrefix = input.required<string>();
  readonly doc = input.required<DocumentStore>();
  protected readonly deviceTabs = DEVICE_TABS;
  protected readonly tabs = BOTTOM_TABS;
  protected readonly selected = computed(() => this.doc().bottomTab());
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Up/Down/Home/End move between the tabs; selection follows focus. */
  protected onKey(event: KeyboardEvent): void {
    const next = rovingIndex(
      event,
      this.tabs.indexOf(this.selected()),
      this.tabs.length,
      'vertical',
    );
    if (next === null) return;
    event.preventDefault();
    this.doc().bottomTab.set(this.tabs[next]);
    this.host.nativeElement
      .querySelector<HTMLElement>(`[id="${this.idPrefix()}-tab-${next}"]`)
      ?.focus();
  }
}
