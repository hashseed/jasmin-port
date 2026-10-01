import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideDynamicIcon } from '@lucide/angular';
import { ActionId, ActionsService } from '../../services/actions.service';
import { ACTION_ICONS } from './action-icons';

/** Menu entries; `null` is a separator. */
export type MenuEntries = readonly (ActionId | null)[];

/** One dropdown menu: icon, label and shortcut per item (docs/plan.md, "Menu bar"). */
@Component({
  selector: 'app-menu-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenu, CdkMenuItem, LucideDynamicIcon],
  template: `
    <div cdkMenu class="menu-panel" [attr.aria-label]="label()">
      @for (item of items(); track $index) {
        @if (item === null) {
          <div class="menu-separator" role="separator"></div>
        } @else {
          <button
            type="button"
            cdkMenuItem
            class="menu-item"
            [attr.data-action]="item.action.id"
            [attr.aria-keyshortcuts]="item.action.shortcut ?? null"
            [cdkMenuItemDisabled]="!item.action.enabled()"
            (cdkMenuItemTriggered)="item.action.run()"
          >
            <span class="menu-icon" aria-hidden="true">
              @if (item.icon) {
                <svg [lucideIcon]="item.icon" [size]="16" [strokeWidth]="1.75"></svg>
              }
            </span>
            <span class="menu-label">{{ item.action.label }}</span>
            <span class="menu-shortcut" aria-hidden="true">{{ item.action.shortcut }}</span>
          </button>
        }
      }
    </div>
  `,
})
export class MenuPanel {
  readonly entries = input.required<MenuEntries>();
  readonly label = input.required<string>();
  private readonly actions = inject(ActionsService).actions;

  protected readonly items = computed(() =>
    this.entries().map((id) =>
      id === null ? null : { action: this.actions[id], icon: ACTION_ICONS[id] ?? null },
    ),
  );
}
