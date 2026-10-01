import { CdkContextMenuTrigger, CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, ElementRef, inject } from '@angular/core';
import { LucideX } from '@lucide/angular';
import { ActionsService } from '../../services/actions.service';
import { Tab, WorkspaceService } from '../../services/workspace.service';
import { rovingIndex } from '../common/roving-focus';

/**
 * Document and help tabs (spec 02 §1). Right-click opens a menu with Close Tab,
 * which closes the selected tab; each tab also has a close button on hover.
 * Keyboard: the selected tab is the strip's one tab stop; Left/Right/Home/End
 * select another tab (selection follows focus), Delete closes the focused tab
 * (the keyboard form of the hover close button).
 */
@Component({
  selector: 'app-tab-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkContextMenuTrigger, CdkMenu, CdkMenuItem, LucideX],
  template: `
    <div class="strip" role="tablist" aria-label="Open tabs" [cdkContextMenuTriggerFor]="context">
      @for (tab of workspace.tabs(); track tab.id) {
        @let selected = tab.id === workspace.selected()?.id;
        <div class="tab" role="presentation" [class.selected]="selected">
          <button
            type="button"
            role="tab"
            class="tab-label"
            [id]="'tab-' + tab.id"
            [attr.aria-selected]="selected"
            [attr.aria-controls]="'panel-' + tab.id"
            [tabindex]="selected ? 0 : -1"
            (click)="workspace.select(tab.id)"
            (keydown)="onKey($event)"
          >
            {{ titleOf(tab) }}
            @if (tab.kind === 'document' && tab.doc.modified()) {
              <span class="modified" title="Unsaved changes" aria-hidden="true"></span>
              <span class="hidden-text">(unsaved changes)</span>
            }
          </button>
          <button
            type="button"
            class="tab-close"
            tabindex="-1"
            aria-hidden="true"
            title="Close Tab"
            (click)="workspace.close(tab.id)"
          >
            <svg lucideX [size]="14"></svg>
          </button>
        </div>
      }
    </div>

    <ng-template #context>
      <div cdkMenu class="menu-panel">
        <button
          type="button"
          cdkMenuItem
          class="menu-item"
          [cdkMenuItemDisabled]="!closeTab.enabled()"
          (cdkMenuItemTriggered)="closeTab.run()"
        >
          <span class="menu-icon"></span>
          <span class="menu-label">{{ closeTab.label }}</span>
          <span></span>
        </button>
      </div>
    </ng-template>
  `,
  styles: `
    .strip {
      display: flex;
      min-height: 34px;
      padding: 0 var(--space-2);
      overflow-x: auto;
    }
    .tab {
      position: relative;
      display: flex;
      align-items: center;
      border-bottom: 2px solid transparent;
      color: var(--text-muted);
    }
    .tab.selected {
      border-bottom-color: var(--accent);
      color: var(--text);
    }
    .tab-label {
      padding: var(--space-2) 26px var(--space-2) var(--space-3);
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      white-space: nowrap;
      cursor: pointer;
    }
    /* Port addition: unsaved edits since the last open or save (Q-UI-5). */
    .modified {
      display: inline-block;
      width: 6px;
      height: 6px;
      margin-left: 6px;
      border-radius: 50%;
      background: currentColor;
      vertical-align: middle;
      opacity: 0.7;
    }
    .hidden-text {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .tab.selected .tab-label {
      font-weight: 500;
    }
    .tab:hover {
      background: var(--bg-hover);
    }
    .tab-close {
      position: absolute;
      right: 4px;
      display: inline-grid;
      place-items: center;
      width: 20px;
      height: 20px;
      padding: 0;
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: inherit;
      opacity: 0;
      cursor: pointer;
    }
    .tab:hover .tab-close,
    .tab.selected .tab-close {
      opacity: 1;
    }
    .tab-close:hover {
      background: var(--bg-subtle);
    }
  `,
})
export class TabStrip {
  protected readonly workspace = inject(WorkspaceService);
  protected readonly closeTab = inject(ActionsService).actions.closeTab;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected onKey(event: KeyboardEvent): void {
    const tabs = this.workspace.tabs();
    const current = tabs.findIndex((t) => t.id === this.workspace.selected()?.id);
    if (event.key === 'Delete' && current >= 0) {
      event.preventDefault();
      this.workspace.close(tabs[current].id);
      this.focusSelected();
      return;
    }
    const next = rovingIndex(event, current, tabs.length, 'horizontal');
    if (next === null) return;
    event.preventDefault();
    this.workspace.select(tabs[next].id);
    this.focusSelected();
  }

  /** Moves focus to the selected tab after the view has updated. */
  private focusSelected(): void {
    queueMicrotask(() => {
      const id = this.workspace.selected()?.id;
      if (id === undefined) return;
      this.host.nativeElement.querySelector<HTMLElement>(`[id="tab-${id}"]`)?.focus();
    });
  }

  protected titleOf(tab: Tab): string {
    return tab.kind === 'document' ? tab.doc.title() : tab.help.title;
  }
}
