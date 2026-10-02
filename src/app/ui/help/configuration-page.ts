import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { hex2dec } from '../../core/number-literals';
import { Settings, SettingsService } from '../../services/settings.service';
import { HelpContentService } from './help-content.service';

/**
 * The fixed font list of the port (spec 02 §12.2, 07 Q-UI-6): the bundled fonts,
 * Java's logical names (as the editor maps them) and common web-safe families,
 * each with the CSS family its drop-down entry is drawn in.
 */
export const FONT_CHOICES: readonly { readonly name: string; readonly css: string }[] = [
  { name: 'JetBrains Mono', css: 'var(--font-mono)' },
  { name: 'Inter', css: 'var(--font-ui)' },
  { name: 'Monospaced', css: 'monospace' },
  { name: 'Sans Serif', css: 'sans-serif' },
  { name: 'Serif', css: 'serif' },
  { name: 'Arial', css: 'Arial, sans-serif' },
  { name: 'Courier New', css: '"Courier New", monospace' },
  { name: 'Georgia', css: 'Georgia, serif' },
  { name: 'Times New Roman', css: '"Times New Roman", serif' },
  { name: 'Trebuchet MS', css: '"Trebuchet MS", sans-serif' },
  { name: 'Verdana', css: 'Verdana, sans-serif' },
];

export const THEME_CHOICES: readonly {
  readonly value: Settings['theme'];
  readonly label: string;
}[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/** Bounds of the number spinners (the original's were unbounded). */
export const FONT_SIZE_RANGE = { min: 6, max: 72 } as const;
export const MEMORY_RANGE = { min: 4, max: 16 * 1024 * 1024 } as const;

const INT_MAX = 2 ** 31 - 1;

/**
 * The offset field's value (spec 02 §12.2): a decimal, hex, binary or octal
 * literal as the parser reads them (`Parser.hex2dec`, then `Integer.parseInt`),
 * or null if it is not a non-negative 32-bit int.
 */
export function parseOffset(text: string): number | null {
  const dec = hex2dec(text.trim().toUpperCase());
  if (!/^\+?\d+$/.test(dec)) return null;
  const value = Number(dec);
  return value <= INT_MAX ? value : null;
}

/** A spinner's value, or null if it is not an integer within `range`. */
export function parseSpinner(text: string, range: { min: number; max: number }): number | null {
  if (!/^\s*\d+\s*$/.test(text)) return null;
  const value = Number(text);
  return value >= range.min && value <= range.max ? value : null;
}

/**
 * The body of the Configuration page (`resources/Configuration.htm`, spec 02
 * §12.2): heading and the settings table with live controls. Every
 * change is saved at once; the theme and help language apply immediately, the
 * rest to documents opened afterwards (the editor font follows at once).
 */
@Component({
  selector: 'app-configuration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let id = idPrefix();
    <h1>Configuration</h1>
    <div class="config">
      <label [for]="id + '-font'">Font:</label>
      <label [for]="id + '-size'">Size:</label>
      <select [id]="id + '-font'" [style.font-family]="fontCss()" (change)="setFont($event)">
        @for (font of fonts(); track font.name) {
          <option
            [value]="font.name"
            [selected]="font.name === settings.all().font"
            [style.font-family]="font.css"
          >
            {{ font.name }}
          </option>
        }
      </select>
      <input
        type="number"
        [id]="id + '-size'"
        [min]="fontSizeRange.min"
        [max]="fontSizeRange.max"
        step="1"
        [value]="settings.all()['font.size']"
        (change)="setNumber($event, 'font.size', fontSizeRange)"
      />

      <label [for]="id + '-memory'">Simulated Memory Size (bytes): (default is 4096)</label>
      <label [for]="id + '-offset'">Start address of the usable memory:</label>
      <input
        type="number"
        [id]="id + '-memory'"
        [min]="memoryRange.min"
        [max]="memoryRange.max"
        step="1"
        [value]="settings.all().memory"
        (change)="setNumber($event, 'memory', memoryRange)"
      />
      <input
        type="text"
        [id]="id + '-offset'"
        spellcheck="false"
        autocomplete="off"
        [value]="settings.all().offset"
        (keydown.enter)="setOffset($event)"
        (change)="setOffset($event)"
      />

      <label [for]="id + '-language'">Context help language:</label>
      <label [for]="id + '-theme'">Theme:</label>
      <select [id]="id + '-language'" (change)="setLanguage($event)">
        @for (language of languages(); track language) {
          <option [value]="language" [selected]="language === settings.all().language">
            {{ language }}
          </option>
        }
      </select>
      <select [id]="id + '-theme'" (change)="setTheme($event)">
        @for (theme of themes; track theme.value) {
          <option [value]="theme.value" [selected]="theme.value === settings.all().theme">
            {{ theme.label }}
          </option>
        }
      </select>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    h1 {
      margin: 0 0 var(--space-3);
      font-size: 15px;
      font-weight: 600;
    }
    .config {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-1) var(--space-6, 24px);
      padding: var(--space-3) var(--space-4) var(--space-4);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      font-size: 13px;
      text-align: left;
    }
    label {
      align-self: end;
      margin-top: var(--space-3);
    }
    select,
    input {
      height: 30px;
      padding: 0 var(--space-2);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      background: var(--bg-panel);
      color: var(--text);
      font: inherit;
    }
  `,
})
export class ConfigurationPage {
  readonly idPrefix = input.required<string>();
  protected readonly settings = inject(SettingsService);
  private readonly content = inject(HelpContentService);

  protected readonly themes = THEME_CHOICES;
  protected readonly fontSizeRange = FONT_SIZE_RANGE;
  protected readonly memoryRange = MEMORY_RANGE;

  /** The fixed list, plus a stored font that is not on it. */
  protected readonly fonts = computed(() => {
    const font = this.settings.all().font;
    return FONT_CHOICES.some((f) => f.name === font)
      ? FONT_CHOICES
      : [...FONT_CHOICES, { name: font, css: `"${font.replace(/["\\]/g, '')}"` }];
  });
  protected readonly fontCss = computed(
    () => this.fonts().find((f) => f.name === this.settings.all().font)?.css ?? null,
  );

  private readonly languageList = signal<readonly string[]>([]);
  /** The help languages, always including the current one. */
  protected readonly languages = computed(() => {
    const list = this.languageList();
    const current = this.settings.all().language;
    return list.includes(current) ? list : [...list, current];
  });

  constructor() {
    void this.content.languages().then((list) => this.languageList.set(list));
  }

  protected setFont(event: Event): void {
    this.settings.set('font', (event.target as HTMLSelectElement).value);
  }

  protected setNumber(
    event: Event,
    key: 'font.size' | 'memory',
    range: { min: number; max: number },
  ): void {
    const field = event.target as HTMLInputElement;
    const value = parseSpinner(field.value, range);
    if (value !== null) this.settings.set(key, value);
    field.value = String(this.settings.get(key));
  }

  /** Enter (or leaving the field) commits a valid offset; anything else reverts. */
  protected setOffset(event: Event): void {
    const field = event.target as HTMLInputElement;
    const value = parseOffset(field.value);
    if (value !== null) this.settings.set('offset', value);
    field.value = String(this.settings.get('offset'));
  }

  protected setLanguage(event: Event): void {
    this.settings.set('language', (event.target as HTMLSelectElement).value);
  }

  protected setTheme(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const theme = THEME_CHOICES.find((t) => t.value === value);
    if (theme) this.settings.set('theme', theme.value);
  }
}
