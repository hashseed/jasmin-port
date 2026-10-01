import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  effect,
  inject,
  input,
} from '@angular/core';
import { ActionsService } from '../../services/actions.service';
import { HelpPage, HelpTab } from '../../services/workspace.service';
import { ConfigurationPage } from './configuration-page';
import { WelcomePage } from './welcome-page';

/**
 * A help tab (spec 02 §12): the Welcome or Configuration page under the shared
 * header of `Welcome.htm`/`Configuration.htm` (logo and link row). `#new` and
 * `#openFile` run File > New and Open Code; the other links navigate within the
 * tab, which keeps its own back/forward history (toolbar Back/Forward).
 */
@Component({
  selector: 'app-help-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WelcomePage, ConfigurationPage],
  template: `
    @let page = help().page();
    <article class="page">
      <img class="logo" src="images/jasmin_logo.png" width="825" height="148" alt="Jasmin" />
      <nav class="links" aria-label="Help links">
        <a href="#new" (click)="run($event, 'new')">New File</a>
        | <a href="#openFile" (click)="run($event, 'open')">Open File</a>
        @if (page === 'welcome') {
          | <a href="Configuration.htm" (click)="go($event, 'configuration')">Configuration</a> |
          <a href="#credits" (click)="go($event, 'welcome', 'credits')">Credits</a>
        } @else {
          | <a href="Welcome.htm" (click)="go($event, 'welcome')">Welcome Page</a> |
          <a href="Welcome.htm#credits" (click)="go($event, 'welcome', 'credits')">Credits</a>
        }
      </nav>
      @switch (page) {
        @case ('welcome') {
          <app-welcome-page [idPrefix]="help().id" />
        }
        @case ('configuration') {
          @defer (on immediate) {
            <app-configuration-page [idPrefix]="help().id" />
          }
        }
      }
    </article>
  `,
  styles: `
    :host {
      display: block;
      height: 100%;
      overflow: auto;
      background: var(--bg-panel);
      /* jasminstyle.css colors (spec 02 §12), lightened for dark mode. */
      --help-heading: #800060;
      --help-link: #bc3ea7;
      --help-blue: #0075cf;
    }
    :host-context(html[data-theme='dark']) {
      --help-heading: #e59ad3;
      --help-link: #e48fd6;
      --help-blue: #6cb6ff;
    }
    @media (prefers-color-scheme: dark) {
      :host-context(html:not([data-theme='light'])) {
        --help-heading: #e59ad3;
        --help-link: #e48fd6;
        --help-blue: #6cb6ff;
      }
    }
    .page {
      /* The original's 20% side margins, centered. */
      width: 60%;
      min-width: 560px;
      margin: 0 auto;
      padding: var(--space-4) 0 48px;
      font-size: 15px;
      line-height: 1.5;
      text-align: center;
    }
    .logo {
      display: block;
      width: min(100%, 560px);
      height: auto;
      margin: var(--space-4) auto var(--space-2);
      border-radius: var(--radius);
    }
    .links {
      color: var(--text-muted);
    }
    a {
      color: var(--help-link);
      font-weight: 700;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
  `,
})
export class HelpView {
  readonly help = input.required<HelpTab>();
  private readonly actions = inject(ActionsService);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    // Show the location's anchor, or the top of the page, after each navigation.
    const injector = inject(Injector);
    effect(() => {
      const { anchor } = this.help().location();
      afterNextRender(() => this.reveal(anchor), { injector });
    });
  }

  protected run(event: Event, action: 'new' | 'open'): void {
    event.preventDefault();
    this.actions.execute(action);
  }

  protected go(event: Event, page: HelpPage, anchor: string | null = null): void {
    event.preventDefault();
    const here = this.help().location();
    // Following a link to the current location only scrolls back to it.
    if (here.page === page && here.anchor === anchor) this.reveal(anchor);
    else this.help().navigate(page, anchor);
  }

  private reveal(anchor: string | null): void {
    const target = anchor ? this.host.querySelector(`[data-anchor="${anchor}"]`) : null;
    if (target) target.scrollIntoView({ block: 'start' });
    else this.host.scrollTop = 0;
  }
}
