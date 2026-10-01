import { ChangeDetectionStrategy, Component, DOCUMENT, effect, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { KeyboardShortcutsService } from './services/keyboard-shortcuts.service';
import { SettingsService } from './services/settings.service';
import { WorkspaceService } from './services/workspace.service';
import { DocumentView } from './ui/document/document-view';
import { HelpView } from './ui/help/help-view';
import { MenuBar } from './ui/shell/menu-bar';
import { TabStrip } from './ui/shell/tab-strip';
import { Toolbar } from './ui/shell/toolbar';

/**
 * The application shell (spec 02 §1): menu bar, toolbar, tab strip and the
 * selected tab's content. Opens the Welcome tab on start.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MenuBar, Toolbar, TabStrip, DocumentView, HelpView],
  template: `
    <header class="chrome">
      <h1 class="visually-hidden">Jasmin</h1>
      <app-menu-bar />
      <app-toolbar />
      <app-tab-strip />
    </header>
    <main class="content">
      @for (tab of workspace.tabs(); track tab.id) {
        <div
          class="tab-panel"
          role="tabpanel"
          [id]="'panel-' + tab.id"
          [attr.aria-labelledby]="'tab-' + tab.id"
          [hidden]="tab.id !== workspace.selected()?.id"
        >
          @switch (tab.kind) {
            @case ('document') {
              <app-document-view [doc]="tab.doc" />
            }
            @case ('help') {
              <app-help-view [help]="tab.help" />
            }
          }
        </div>
      }
    </main>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    .chrome {
      background: var(--bg-panel);
      border-bottom: 1px solid var(--border);
    }
    app-toolbar,
    app-tab-strip {
      display: block;
      border-top: 1px solid var(--border);
    }
    .content {
      position: relative;
      flex: 1;
      min-height: 0;
    }
    .tab-panel {
      position: absolute;
      inset: 0;
    }
  `,
})
export class App {
  protected readonly workspace = inject(WorkspaceService);

  constructor() {
    inject(KeyboardShortcutsService).install();
    this.workspace.openHelp('welcome');

    // Window title follows the selected document; selecting a help tab keeps it (spec 02 §1).
    const title = inject(Title);
    effect(() => {
      const doc = this.workspace.document();
      if (doc) title.setTitle(`Jasmin - ${doc.title()}`);
    });

    // Theme setting (spec 02 §12.2 port note): `system` follows prefers-color-scheme.
    const settings = inject(SettingsService);
    const root = inject(DOCUMENT).documentElement;
    effect(() => {
      const theme = settings.all().theme;
      if (theme === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
    });
  }
}
