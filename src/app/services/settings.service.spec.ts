import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  SettingsService,
  loadSettings,
} from './settings.service';

describe('SettingsService (spec 09 §3)', () => {
  beforeEach(() => localStorage.clear());

  it('starts from the defaults', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.font).toBe('JetBrains Mono');
    expect(DEFAULT_SETTINGS.memory).toBe(4096);
  });

  it('saves every write immediately under jasmin.settings', () => {
    const settings = TestBed.inject(SettingsService);
    settings.set('split2.location', 320);
    settings.set('theme', 'dark');
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(stored['split2.location']).toBe(320);
    expect(stored.theme).toBe('dark');
    expect(loadSettings()['split2.location']).toBe(320);
  });

  it('falls back to defaults for corrupt JSON and invalid values', () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ memory: 'lots', 'font.size': 14, theme: 'neon', 'split1.location': -5 }),
    );
    const loaded = loadSettings();
    expect(loaded.memory).toBe(4096);
    expect(loaded['font.size']).toBe(14);
    expect(loaded.theme).toBe('system');
    expect(loaded['split1.location']).toBeNull();
  });

  it('ignores invalid writes', () => {
    const settings = TestBed.inject(SettingsService);
    settings.set('memory', -4);
    expect(settings.get('memory')).toBe(4096);
  });
});
