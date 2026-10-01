import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { DocumentStore } from '../../services/document-store';
import { SettingsService } from '../../services/settings.service';
import { HelpContentService } from './help-content.service';
import { HelpIndex, contextHelpFor, helpLinkTarget } from './help-index';

/**
 * The context help pane, the bottom `Help` tab (spec 02 §11): the help page of
 * the caret line's mnemonic, or the original's "no help" texts. Pages are
 * sanitized to inert markup (no scripts, styles, handlers or attributes, see
 * `sanitizeHelpHtml`) and restyled to the app's typography; links to other help
 * pages open them in the pane until the caret moves to a line with another
 * mnemonic.
 */
@Component({
  selector: 'app-context-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // The page markup is inserted from code, so its styles cannot be emulated.
  encapsulation: ViewEncapsulation.None,
  // Links are focusable and activate with Enter as a click.
  host: { '(click)': 'followLink($event)' },
  template: `
    @let shown = context();
    <div
      #page
      class="context-help-page"
      role="document"
      [attr.aria-label]="shown?.kind === 'page' ? 'Help for ' + shown.mnemonic : null"
      [hidden]="shown?.kind !== 'page'"
    ></div>
    @if (shown && shown.kind !== 'page') {
      <p class="context-help-none">{{ shown.text }}</p>
    }
  `,
  styles: `
    app-context-help {
      display: block;
    }
    .context-help-page,
    .context-help-none {
      max-width: 80ch;
      margin: 0;
      font-family: var(--font-ui);
      font-size: var(--font-size-ui);
      line-height: 1.6;
      color: var(--text);
    }
    .context-help-none {
      color: var(--text-muted);
    }
    .context-help-page strong {
      font-weight: 600;
    }
    .context-help-page a {
      color: var(--accent);
      font-weight: 600;
      text-decoration: none;
    }
    .context-help-page a:hover {
      text-decoration: underline;
    }
  `,
})
export class ContextHelp {
  readonly doc = input.required<DocumentStore>();
  private readonly content = inject(HelpContentService);
  private readonly language = inject(SettingsService).watch('language');
  private readonly pageRef = viewChild.required<ElementRef<HTMLElement>>('page');

  /** The caret line's mnemonic; re-read whenever the program is re-parsed. */
  readonly mnemonic = computed(() => {
    const doc = this.doc();
    doc.version();
    return doc.session.program.result(doc.caretLine())?.mnemo ?? null;
  });

  /** A page opened through a link, and the mnemonic it was opened from. */
  private readonly link = signal<{ readonly from: string | null; readonly page: string } | null>(
    null,
  );
  /** The linked page while the caret line's mnemonic stays the same. */
  private readonly linked = computed(() => {
    const link = this.link();
    return link && link.from === this.mnemonic() ? link.page : null;
  });

  private readonly index = signal<HelpIndex | null>(null);

  /** What the pane shows; null until the index has loaded. */
  protected readonly context = computed(() => {
    const index = this.index();
    return index ? contextHelpFor(index, this.linked() ?? this.mnemonic()) : null;
  });

  constructor() {
    // Leaving the mnemonic forgets the link (returning to it shows its own page).
    effect(() => {
      this.mnemonic();
      untracked(() => this.link.set(null));
    });
    effect((onCleanup) => {
      const language = this.language();
      let current = true;
      onCleanup(() => (current = false));
      void this.content.index(language).then((index) => current && this.index.set(index));
    });
    // The sanitized page goes in as inert nodes, without Angular's [innerHTML].
    effect((onCleanup) => {
      const shown = this.context();
      const host = this.pageRef().nativeElement;
      if (shown?.kind !== 'page') {
        host.replaceChildren();
        return;
      }
      const language = this.language();
      let current = true;
      onCleanup(() => (current = false));
      this.content.page(language, shown.file).then(
        (html) => current && host.replaceChildren(toFragment(html)),
        () => current && host.replaceChildren(),
      );
    });
  }

  protected followLink(event: Event): void {
    const link = (event.target as Element | null)?.closest?.('a');
    if (!link) return;
    event.preventDefault();
    const target = helpLinkTarget(link.getAttribute('href') ?? '');
    if (target) this.link.set({ from: this.mnemonic(), page: target.toUpperCase() });
  }
}

/** Parses sanitized markup into inert nodes (a template's content runs nothing). */
function toFragment(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.content;
}
