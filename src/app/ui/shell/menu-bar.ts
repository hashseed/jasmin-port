import { CdkMenuBar, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, DOCUMENT, inject, viewChild } from '@angular/core';
import { ActionsService } from '../../services/actions.service';
import { MenuEntries, MenuPanel } from './menu-panel';

/** Menu contents of spec 02 §2. */
const FILE_MENU: MenuEntries = [
  'new',
  null,
  'open',
  'save',
  null,
  'saveMemory',
  'loadMemory',
  null,
  'closeDocument',
  null,
  'configuration',
  null,
  'exit',
];
const EDIT_MENU: MenuEntries = ['undo', 'redo', null, 'cut', 'copy', 'paste'];
const RUN_MENU: MenuEntries = ['run', 'pause', 'step', 'executeLine'];

/**
 * The menu bar (spec 02 §2). The original's mnemonics Alt+F, Alt+E and Alt+R are
 * not bound: browsers use them for their own menus (Chrome and Edge open their
 * menu on Alt+F, Firefox its File and Edit menus). Instead F10, the platform key
 * for "go to the menu bar", focuses File; the arrow keys, typeahead letters, Enter
 * and Escape then work as in the CDK menu bar, and F10 or Escape on the bar
 * returns focus to where it was.
 */
@Component({
  selector: 'app-menu-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuBar, CdkMenuItem, CdkMenuTrigger, MenuPanel],
  host: { '(window:keydown)': 'onWindowKey($event)' },
  template: `
    <nav aria-label="Main menu">
      <div cdkMenuBar class="bar" aria-keyshortcuts="F10">
        <button
          type="button"
          cdkMenuItem
          class="top"
          (keydown)="onBarKey($event)"
          [cdkMenuTriggerFor]="file"
        >
          File
        </button>
        <button
          type="button"
          cdkMenuItem
          class="top"
          (keydown)="onBarKey($event)"
          [cdkMenuTriggerFor]="edit"
          [cdkMenuItemDisabled]="!editEnabled()"
        >
          Edit
        </button>
        <button
          type="button"
          cdkMenuItem
          class="top"
          (keydown)="onBarKey($event)"
          [cdkMenuTriggerFor]="run"
          [cdkMenuItemDisabled]="!runEnabled()"
        >
          Run
        </button>
      </div>
    </nav>

    <ng-template #file><app-menu-panel label="File" [entries]="fileMenu" /></ng-template>
    <ng-template #edit><app-menu-panel label="Edit" [entries]="editMenu" /></ng-template>
    <ng-template #run><app-menu-panel label="Run" [entries]="runMenu" /></ng-template>
  `,
  styles: `
    .bar {
      display: flex;
      gap: 2px;
      padding: 2px var(--space-2);
    }
    .top {
      padding: 3px var(--space-2);
      border: 0;
      border-radius: var(--radius-sm);
      background: none;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    .top:hover:not([aria-disabled='true']),
    .top[aria-expanded='true'] {
      background: var(--bg-hover);
    }
    .top[aria-disabled='true'] {
      color: var(--text-muted);
      opacity: 0.5;
      cursor: default;
    }
  `,
})
export class MenuBar {
  private readonly service = inject(ActionsService);
  protected readonly editEnabled = this.service.editMenuEnabled;
  protected readonly runEnabled = this.service.runMenuEnabled;
  protected readonly fileMenu = FILE_MENU;
  protected readonly editMenu = EDIT_MENU;
  protected readonly runMenu = RUN_MENU;

  private readonly bar = viewChild.required(CdkMenuBar);
  private readonly document = inject(DOCUMENT);
  /** Where focus was before F10, to return to on F10 or Escape. */
  private returnFocus: HTMLElement | null = null;

  protected onWindowKey(event: KeyboardEvent): void {
    if (event.key !== 'F10' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey)
      return;
    event.preventDefault();
    if (this.containsFocus()) {
      this.restoreFocus();
      return;
    }
    const active = this.document.activeElement;
    this.returnFocus =
      active instanceof HTMLElement && active !== this.document.body ? active : null;
    this.bar().focusFirstItem('keyboard');
  }

  protected onBarKey(event: KeyboardEvent): void {
    // Escape on the bar itself (no menu open) leaves it, like a desktop menu bar.
    const open = (event.target as HTMLElement).getAttribute('aria-expanded') === 'true';
    if (event.key === 'Escape' && !open) this.restoreFocus();
  }

  private containsFocus(): boolean {
    const bar = this.document.querySelector('app-menu-bar');
    return !!bar && bar.contains(this.document.activeElement);
  }

  private restoreFocus(): void {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) target.focus();
    else (this.document.activeElement as HTMLElement | null)?.blur();
  }
}
