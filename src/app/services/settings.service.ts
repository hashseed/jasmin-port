import { Injectable, Signal, computed, signal } from '@angular/core';

/** The settings of spec 09 §3, under their original property names. */
export interface Settings {
  font: string;
  'font.size': number;
  memory: number;
  offset: number;
  language: string;
  'lastpath.asm': string | null;
  'lastpath.mem': string | null;
  'split1.location': number | null;
  'split2.location': number | null;
  'split3.location': number | null;
  'split4.location': number | null;
  theme: 'system' | 'light' | 'dark';
}

export type SettingKey = keyof Settings;

/** Defaults of spec 09 §3; `null` split locations mean "computed" (spec 02 §5). */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  font: 'JetBrains Mono',
  'font.size': 12,
  memory: 4096,
  offset: 0,
  language: 'en',
  'lastpath.asm': null,
  'lastpath.mem': null,
  'split1.location': null,
  'split2.location': null,
  'split3.location': null,
  'split4.location': null,
  theme: 'system',
};

export const SETTINGS_STORAGE_KEY = 'jasmin.settings';

type Validator = (value: unknown) => boolean;

const isString: Validator = (v) => typeof v === 'string';
const isInt: Validator = (v) => typeof v === 'number' && Number.isInteger(v);
const isPositiveInt: Validator = (v) => isInt(v) && (v as number) > 0;
const isNonNegativeInt: Validator = (v) => isInt(v) && (v as number) >= 0;
const isOptionalString: Validator = (v) => v === null || isString(v);
const isLocation: Validator = (v) => v === null || isNonNegativeInt(v);

const VALIDATORS: Record<SettingKey, Validator> = {
  font: isString,
  'font.size': isPositiveInt,
  memory: isPositiveInt,
  offset: isNonNegativeInt,
  language: isString,
  'lastpath.asm': isOptionalString,
  'lastpath.mem': isOptionalString,
  'split1.location': isLocation,
  'split2.location': isLocation,
  'split3.location': isLocation,
  'split4.location': isLocation,
  theme: (v) => v === 'system' || v === 'light' || v === 'dark',
};

/**
 * Settings persisted as one JSON object in `localStorage` (spec 09 §3). Every
 * write is saved immediately; missing or invalid values fall back to the defaults.
 */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  private readonly state = signal<Settings>(loadSettings());

  /** All settings, read-only. */
  readonly all: Signal<Readonly<Settings>> = this.state.asReadonly();

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.state()[key];
  }

  /** A signal of one setting. */
  watch<K extends SettingKey>(key: K): Signal<Settings[K]> {
    return computed(() => this.state()[key]);
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): void {
    if (!VALIDATORS[key](value)) return;
    this.state.update((s) => ({ ...s, [key]: value }));
    saveSettings(this.state());
  }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Reads `jasmin.settings`, keeping only valid values over the defaults. */
export function loadSettings(): Settings {
  const settings: Settings = { ...DEFAULT_SETTINGS };
  let raw: unknown;
  try {
    const text = storage()?.getItem(SETTINGS_STORAGE_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return settings;
  const record = raw as Record<string, unknown>;
  const target = settings as unknown as Record<string, unknown>;
  for (const key of Object.keys(VALIDATORS) as SettingKey[]) {
    if (key in record && VALIDATORS[key](record[key])) target[key] = record[key];
  }
  return settings;
}

function saveSettings(settings: Settings): void {
  try {
    storage()?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage full or blocked: settings stay in memory for this session.
  }
}
