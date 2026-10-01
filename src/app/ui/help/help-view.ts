import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { ActionsService } from '../../services/actions.service';
import { HelpPage, HelpTab } from '../../services/workspace.service';

/**
 * A help tab (spec 02 §12). M4 placeholder of the Welcome and Configuration
 * pages with their link rows; `#new` and `#openFile` run File > New and Open
 * Code, the other links navigate within the tab (back/forward history). The
 * real pages and texts arrive in M6.
 */
@Component({
  selector: 'app-help-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="page">
      <h1>Jasmin</h1>
      <nav class="links" aria-label="Help links">
        <button type="button" class="link" (click)="actions.execute('new')">New File</button>
        |
        <button type="button" class="link" (click)="actions.execute('open')">Open File</button>
        |
        @if (help().page() === 'welcome') {
          <button type="button" class="link" (click)="go('configuration')">Configuration</button>
        } @else {
          <button type="button" class="link" (click)="go('welcome')">Welcome Page</button>
        }
        |
        <button type="button" class="link" (click)="showCredits()">Credits</button>
      </nav>
      @if (help().page() === 'welcome') {
        <h2>Welcome</h2>
        <p class="muted">
          The browser port of the TUM x86 assembler simulator. The full Welcome page arrives in M6.
        </p>
      } @else {
        <h2>Configuration</h2>
        <p class="muted">The configuration controls arrive in M6.</p>
      }
      <section id="{{ help().id }}-credits" class="credits">
        <p>
          © 2006 - 2017 Lehrstuhl für Rechnertechnik und Rechnerorganisation, Technische Universität
          München
        </p>
        <p>Version 1.5.11 (2016-10-28) · web port in development</p>
      </section>
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: auto;
    }
    .page {
      max-width: 720px;
      margin: 0 auto;
      padding: var(--space-4) var(--space-4) 48px;
    }
    h1 {
      margin: var(--space-4) 0 var(--space-2);
      font-size: 28px;
      color: var(--syntax-constant);
    }
    h2 {
      font-size: 18px;
      color: var(--syntax-constant);
    }
    .links {
      color: var(--text-muted);
    }
    .link {
      padding: 0 2px;
      border: 0;
      background: none;
      color: var(--syntax-constant);
      font: inherit;
      font-weight: 600;
      cursor: pointer;
    }
    .link:hover {
      text-decoration: underline;
    }
    .muted,
    .credits {
      color: var(--text-muted);
    }
    .credits {
      margin-top: 48px;
      font-size: 12px;
    }
  `,
})
export class HelpView {
  readonly help = input.required<HelpTab>();
  protected readonly actions = inject(ActionsService);

  protected go(page: HelpPage): void {
    this.help().navigate(page);
  }

  protected showCredits(): void {
    document.getElementById(`${this.help().id}-credits`)?.scrollIntoView({ behavior: 'smooth' });
  }
}
