import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PORT_VERSION } from '../../version';

export { PORT_VERSION };
export const PORT_URL = 'https://github.com/hashseed/jasmin-port';

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
 * The body of the Welcome page (`resources/Welcome.htm`, spec 02 §12.1) below the
 * shared header: the bug-report line (pointing to the port's issue tracker, spec
 * 09 §5), the photo and the credits block with a line for the web port.
 */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="bug">
      <i>
        <span class="blue">Think you found a bug? Tell us at </span>
        <a [href]="portUrl + '/issues'" target="_blank" rel="noopener">{{ portIssues }}</a>
        <span class="blue"> or create a pull request on GitHub.</span>
      </i>
    </p>
    <img class="photo" src="images/jasmin.jpg" width="800" height="600" alt="" />

    <section class="credits" [id]="idPrefix() + '-credits'" data-anchor="credits">
      <div class="copyright">© 2006 - 2017</div>
      <div>
        <p>
          Lehrstuhl für Rechnertechnik und Rechnerorganisation<br />
          Technische Universität München<br />
          Prof. Dr. M. Schulz<br />
          <a href="https://github.com/TUM-LRR/Jasmin" target="_blank" rel="noopener"
            >https://github.com/TUM-LRR/Jasmin</a
          >
        </p>
        <p>Version 1.5.11 <small>(2016-10-28)</small></p>
        <p class="port">
          Web port: version {{ portVersion }},
          <a [href]="portUrl" target="_blank" rel="noopener">{{ portUrl }}</a>
        </p>
        @for (group of credits; track group.heading) {
          <p class="group">{{ group.heading }}</p>
          <ul class="authors">
            @for (name of group.names; track name) {
              <li>{{ name }}</li>
            }
          </ul>
        }
      </div>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .blue,
    .authors {
      color: var(--help-blue);
    }
    a {
      color: var(--help-link);
      font-weight: 700;
      text-decoration: none;
    }
    .photo {
      max-width: 100%;
      height: auto;
      margin-top: var(--space-1);
      border-radius: var(--radius);
    }
    .credits {
      display: grid;
      grid-template-columns: 25% 1fr;
      gap: var(--space-2);
      margin-top: var(--space-4);
      text-align: left;
      scroll-margin-top: var(--space-4);
    }
    .copyright {
      text-align: right;
    }
    .credits p {
      margin: 0 0 var(--space-4);
    }
    .credits .group {
      margin: 0;
    }
    .authors {
      display: grid;
      grid-template-columns: 1fr 1fr;
      margin: 0 0 var(--space-4);
      padding: 0;
      list-style: none;
    }
  `,
})
export class WelcomePage {
  readonly idPrefix = input.required<string>();
  protected readonly credits = CREDITS;
  protected readonly portVersion = PORT_VERSION;
  protected readonly portUrl = PORT_URL;
  protected readonly portIssues = PORT_URL.replace('https://', '') + '/issues';
}
