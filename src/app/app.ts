import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * M0 placeholder of the application shell (spec 02 §1): menu bar, toolbar, tab
 * strip and content area, styled with the design tokens. The real shell arrives
 * in M4.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="chrome">
      <nav class="menu-bar" aria-label="Main menu">
        @for (menu of menus; track menu) {
          <span class="menu">{{ menu }}</span>
        }
      </nav>
      <div class="toolbar" role="toolbar" aria-label="Toolbar"></div>
      <div class="tab-strip" role="tablist">
        <span class="tab" role="tab" aria-selected="true">Welcome</span>
      </div>
    </header>
    <main class="content">
      <section class="card">
        <h1>Jasmin</h1>
        <p>The browser port of the TUM x86 assembler simulator is under construction.</p>
      </section>
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
    .menu-bar {
      display: flex;
      gap: var(--space-1);
      padding: var(--space-1) var(--space-2);
    }
    .menu {
      padding: 2px var(--space-2);
      border-radius: var(--radius-sm);
    }
    .toolbar {
      height: var(--toolbar-height);
      border-top: 1px solid var(--border);
    }
    .tab-strip {
      display: flex;
      padding: 0 var(--space-2);
      border-top: 1px solid var(--border);
    }
    .tab {
      padding: var(--space-2) var(--space-3);
      border-bottom: 2px solid var(--accent);
      font-weight: 500;
    }
    .content {
      flex: 1;
      overflow: auto;
      padding: var(--space-3);
    }
    .card {
      max-width: 640px;
      margin: 10vh auto 0;
      padding: var(--space-4);
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: var(--radius);
    }
    h1 {
      margin: 0 0 var(--space-2);
      font-size: 20px;
      color: var(--syntax-mnemonic);
    }
    p {
      margin: 0;
      color: var(--text-muted);
    }
  `,
})
export class App {
  protected readonly menus = ['File', 'Edit', 'Run'];
}
