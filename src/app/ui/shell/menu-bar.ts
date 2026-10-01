import { CdkMenuBar, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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

@Component({
  selector: 'app-menu-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkMenuBar, CdkMenuItem, CdkMenuTrigger, MenuPanel],
  template: `
    <nav aria-label="Main menu">
      <div cdkMenuBar class="bar">
        <button type="button" cdkMenuItem class="top" [cdkMenuTriggerFor]="file">File</button>
        <button
          type="button"
          cdkMenuItem
          class="top"
          [cdkMenuTriggerFor]="edit"
          [cdkMenuItemDisabled]="!editEnabled()"
        >
          Edit
        </button>
        <button
          type="button"
          cdkMenuItem
          class="top"
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
}
