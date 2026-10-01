import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ActionId, ActionsService, AppAction } from '../../services/actions.service';
import { ACTION_ICONS, PAUSE_ICON } from './action-icons';

/** Toolbar buttons in the original order and groups (spec 02 §3). */
const GROUPS: readonly (readonly ActionId[])[] = [
  ['new', 'open', 'save'],
  ['undo', 'redo'],
  ['cut', 'copy', 'paste'],
  ['back', 'forward'],
  ['runPause', 'step', 'executeLine', 'stop'],
  ['reset'],
  ['takeSnapshot', 'loadSnapshot'],
];

export function tooltipOf(action: AppAction): string {
  return action.shortcut ? `${action.tooltip} (${action.shortcut})` : action.tooltip;
}

@Component({
  selector: 'app-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideDynamicIcon],
  host: { role: 'toolbar', 'aria-label': 'Toolbar' },
  template: `
    @for (group of groups; track $index) {
      @if (!$first) {
        <span class="separator" aria-hidden="true"></span>
      }
      @for (action of group; track action.id) {
        <button
          type="button"
          class="tool"
          [class.run]="action.id === 'runPause'"
          [class.running]="action.id === 'runPause' && isRunning()"
          [class.stop]="action.id === 'stop'"
          [attr.data-action]="action.id"
          [attr.aria-label]="action.tooltip"
          [attr.aria-keyshortcuts]="action.shortcut ?? null"
          [title]="tooltip(action)"
          [disabled]="!action.enabled()"
          (click)="action.run()"
        >
          <svg [lucideIcon]="iconOf(action.id)" [size]="18" [strokeWidth]="1.75"></svg>
        </button>
      }
    }
  `,
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 2px;
      height: var(--toolbar-height);
      padding: 0 var(--space-2);
    }
    .separator {
      width: 1px;
      height: 20px;
      margin: 0 var(--space-1);
      background: var(--border);
    }
    .tool {
      display: inline-grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: var(--text);
      cursor: pointer;
    }
    .tool:hover:not(:disabled) {
      background: var(--bg-hover);
    }
    .tool:disabled {
      color: var(--text-muted);
      opacity: 0.4;
      cursor: default;
    }
    .run:not(:disabled) {
      color: var(--run);
    }
    .run.running:not(:disabled) {
      color: var(--pause);
    }
    .stop:hover:not(:disabled) {
      color: var(--stop);
    }
  `,
})
export class Toolbar {
  private readonly service = inject(ActionsService);
  protected readonly isRunning = this.service.isRunning;
  protected readonly groups = GROUPS.map((ids) => ids.map((id) => this.service.actions[id]));
  protected readonly tooltip = tooltipOf;

  protected iconOf(id: ActionId) {
    if (id === 'runPause' && this.isRunning()) return PAUSE_ICON;
    return ACTION_ICONS[id] ?? null;
  }
}
