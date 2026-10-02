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
import { SOURCE_URL } from './version';

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
      <div class="top-row">
        <app-menu-bar />
        <a
          class="source-link"
          [href]="sourceUrl"
          target="_blank"
          rel="noopener"
          title="Source code on GitHub"
          aria-label="Source code on GitHub"
        >
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
            />
          </svg>
        </a>
      </div>
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
    .top-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-right: var(--space-2);
    }
    .source-link {
      display: inline-flex;
      padding: 3px;
      border-radius: var(--radius-sm);
      color: var(--text-muted);
    }
    .source-link:hover {
      background: var(--bg-hover);
      color: inherit;
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
  protected readonly sourceUrl = SOURCE_URL;

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
