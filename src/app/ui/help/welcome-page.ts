import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Sample, SAMPLES } from '../../samples';
import { FileService } from '../../services/file.service';
import { PORT_VERSION, SOURCE_URL } from '../../version';

export { PORT_VERSION };
export const PORT_URL = SOURCE_URL;

/**
 * The body of the Welcome page (spec 02 §12.1, port note): a short getting-started
 * tutorial, sample programs that open in a new document, and links to the port's and
 * the original's repositories.
 */
@Component({
  selector: 'app-welcome-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section>
      <h2>Getting started</h2>
      <ol>
        <li>Start a new program with <em>New File</em> (Alt+N).</li>
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
      <h2>Samples</h2>
      <p>
        Programs written in 2007 by one of Jasmin's original developers. Click one to open it in a
        new document.
      </p>
      <ul class="samples">
        @for (sample of samples; track sample.file) {
          <li>
            <a [href]="'samples/' + sample.file" (click)="open($event, sample)">{{
              sample.title
            }}</a>
          </li>
        }
      </ul>
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
        Version {{ portVersion }}, ported from Jasmin 1.5.11 by the Technische Universität München.
        The original Java version is at
        <a href="https://github.com/TUM-LRR/Jasmin" target="_blank" rel="noopener"
          >github.com/TUM-LRR/Jasmin</a
        >.
      </p>
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
    ol li + li {
      margin-top: var(--space-1);
    }
    .samples {
      margin: 0;
      padding: 0;
      list-style: none;
      columns: 3 10em;
      column-gap: var(--space-4);
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
  `,
})
export class WelcomePage {
  protected readonly portVersion = PORT_VERSION;
  protected readonly portUrl = PORT_URL;
  protected readonly portRepo = PORT_URL.replace('https://', '');
  protected readonly samples = SAMPLES;
  private readonly files = inject(FileService);

  protected open(event: Event, sample: Sample): void {
    event.preventDefault();
    void this.files.openSample(sample);
  }
}
