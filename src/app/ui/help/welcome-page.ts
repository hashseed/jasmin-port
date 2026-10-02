import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PORT_VERSION, SOURCE_URL } from '../../version';

export { PORT_VERSION };
export const PORT_URL = SOURCE_URL;

/** Credits of `Welcome.htm`, in its order (spec 09 §5). */
const CREDITS: readonly { readonly heading: string; readonly names: readonly string[] }[] = [
  { heading: 'Current Maintainer:', names: ['Marcel Meyer'] },
  {
    heading: 'Initial Development:',
    names: ['Yang Guo', 'Jakob Kummerow', 'Kai Orend', 'Stefanie Schmid'],
  },
  {
    heading: 'Initial Documentation/Tutorials:',
    names: ['André Aichert', 'Mattias Kaiser', 'Sebastian Ullherr'],
  },
  { heading: 'Additional Credits:', names: ['Johannes Roith', 'Alexander Ried'] },
];

/**
 * The body of the Welcome page (spec 02 §12.1, port note): a short getting-started
 * tutorial, links to the port's and the original's repositories, and the credits
 * (anchor `credits`) with a line for the web port.
 */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <h2>Getting started</h2>
      <ol>
        <li>Open a new document with <em>New File</em> (Alt+N).</li>
        <li>
          Type a program, one instruction per line, for example
          <code>mov eax, 5</code> and <code>add eax, 7</code>.
        </li>
        <li>
          Press F7 to step through it line by line, or F5 to run it. Registers, flags and memory
          update as it goes; values that just changed are bold.
        </li>
        <li>Click a line number to set a breakpoint, and Reset to start over.</li>
        <li>The Help tab below the editor explains the instruction under the cursor.</li>
      </ol>
    </section>

    <section>
      <h2>Source</h2>
      <p>
        This web port is open source at
        <a [href]="portUrl" target="_blank" rel="noopener">{{ portRepo }}</a
        >. Found a bug?
        <a [href]="portUrl + '/issues'" target="_blank" rel="noopener">Open an issue</a>
        or send a pull request.
      </p>
      <p>
        The original Java version is at
        <a href="https://github.com/TUM-LRR/Jasmin" target="_blank" rel="noopener"
          >github.com/TUM-LRR/Jasmin</a
        >.
      </p>
    </section>

    <section class="credits" [id]="idPrefix() + '-credits'" data-anchor="credits">
      <h2>Credits</h2>
      <p>
        © 2006 - 2017 Lehrstuhl für Rechnertechnik und Rechnerorganisation, Technische Universität
        München, Prof. Dr. M. Schulz. Version 1.5.11 (2016-10-28).
      </p>
      <p>Web port: version {{ portVersion }}.</p>
      <dl>
        @for (group of credits; track group.heading) {
          <dt>{{ group.heading }}</dt>
          <dd>{{ group.names.join(', ') }}</dd>
        }
      </dl>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    section + section {
      margin-top: 28px;
    }
    h2 {
      margin: 0 0 var(--space-2);
      font-size: 15px;
      font-weight: 600;
    }
    p {
      margin: 0 0 var(--space-2);
    }
    ol {
      margin: 0;
      padding-left: 1.4em;
    }
    li + li {
      margin-top: var(--space-1);
    }
    code {
      font-family: var(--font-mono);
      font-size: 13px;
    }
    a {
      color: var(--help-link);
      font-weight: 500;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .credits {
      color: var(--text-muted);
      font-size: 13px;
      scroll-margin-top: var(--space-4);
    }
    dl {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 2px var(--space-3);
      margin: var(--space-2) 0 0;
    }
    dd {
      margin: 0;
    }
    @media (max-width: 499px) {
      dl {
        grid-template-columns: 1fr;
      }
      dd {
        margin-bottom: var(--space-1);
      }
    }
  `,
})
export class WelcomePage {
  readonly idPrefix = input.required<string>();
  protected readonly credits = CREDITS;
  protected readonly portVersion = PORT_VERSION;
  protected readonly portUrl = PORT_URL;
  protected readonly portRepo = PORT_URL.replace('https://', '');
}
