import { DOCUMENT, Injectable, InjectionToken, inject } from '@angular/core';
import { HelpIndex } from './help-index';
import { sanitizeHelpHtml } from './sanitize-help';

/** Fetches a text file of the bundled assets, relative to the base href. */
export const HELP_FETCH = new InjectionToken<(path: string) => Promise<string>>('HELP_FETCH', {
  providedIn: 'root',
  factory: () => {
    const doc = inject(DOCUMENT);
    return async (path: string) => {
      const response = await fetch(new URL(path, doc.baseURI));
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      return response.text();
    };
  },
});

/**
 * The bundled help pages (spec 09 §1.1): `help/<language>/index.json` is loaded
 * on first use, pages are fetched lazily, sanitized once and cached. Nothing is
 * part of the initial bundle. A failed fetch is not cached, so it is retried.
 */
@Injectable({ providedIn: 'root' })
export class HelpContentService {
  private readonly fetchText = inject(HELP_FETCH);
  private readonly cache = new Map<string, Promise<unknown>>();

  /** The help languages: the sub-directories of `help/` (spec 09 §1.1). */
  languages(): Promise<readonly string[]> {
    return this.load('help/languages.json', (text) => parseLanguages(text)).catch(() => ['en']);
  }

  /** A language's index; empty when it cannot be loaded, so every page is missing. */
  index(language: string): Promise<HelpIndex> {
    return this.load(`help/${encodeURIComponent(language)}/index.json`, parseIndex).catch(
      () => ({}),
    );
  }

  /** A page as sanitized markup (see {@link sanitizeHelpHtml}). */
  page(language: string, file: string): Promise<string> {
    return this.load(
      `help/${encodeURIComponent(language)}/${encodeURIComponent(file)}`,
      sanitizeHelpHtml,
    );
  }

  private load<T>(path: string, parse: (text: string) => T): Promise<T> {
    let entry = this.cache.get(path) as Promise<T> | undefined;
    if (!entry) {
      entry = this.fetchText(path).then(parse);
      entry.catch(() => this.cache.delete(path));
      this.cache.set(path, entry);
    }
    return entry;
  }
}

function parseIndex(text: string): HelpIndex {
  const raw: unknown = JSON.parse(text);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const index: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') index[key.toLowerCase()] = value;
  }
  return index;
}

function parseLanguages(text: string): string[] {
  const raw: unknown = JSON.parse(text);
  const list = Array.isArray(raw) ? raw.filter((l): l is string => typeof l === 'string') : [];
  return list.length ? list : ['en'];
}
