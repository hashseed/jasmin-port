import { TestBed } from '@angular/core/testing';
import { SettingsService } from '../../services/settings.service';
import {
  ConfigurationPage,
  FONT_CHOICES,
  MEMORY_RANGE,
  parseOffset,
  parseSpinner,
} from './configuration-page';
import { HELP_FETCH } from './help-content.service';

describe('Configuration page', () => {
  it('parses the offset like the original (hex2dec, then a non-negative int)', () => {
    expect(parseOffset('0')).toBe(0);
    expect(parseOffset(' 4096 ')).toBe(4096);
    expect(parseOffset('0x100')).toBe(256);
    expect(parseOffset('100h')).toBe(256);
    expect(parseOffset('$10')).toBe(16);
    expect(parseOffset('101b')).toBe(5);
    expect(parseOffset('17o')).toBe(15);
    expect(parseOffset('2147483647')).toBe(2147483647);
    expect(parseOffset('2147483648')).toBeNull();
    expect(parseOffset('-4')).toBeNull();
    expect(parseOffset('ten')).toBeNull();
    expect(parseOffset('')).toBeNull();
  });

  it('parses spinner values within their range', () => {
    expect(parseSpinner('4096', MEMORY_RANGE)).toBe(4096);
    expect(parseSpinner('0', MEMORY_RANGE)).toBeNull();
    expect(parseSpinner('1.5', MEMORY_RANGE)).toBeNull();
    expect(parseSpinner('', MEMORY_RANGE)).toBeNull();
  });

  describe('controls', () => {
    let settings: SettingsService;
    let element: HTMLElement;

    beforeEach(async () => {
      localStorage.clear();
      TestBed.configureTestingModule({
        providers: [{ provide: HELP_FETCH, useValue: async () => '["en"]' }],
      });
      settings = TestBed.inject(SettingsService);
      const fixture = TestBed.createComponent(ConfigurationPage);
      fixture.componentRef.setInput('idPrefix', 'help-x');
      await fixture.whenStable();
      element = fixture.nativeElement as HTMLElement;
    });

    const field = <T extends HTMLElement>(id: string) =>
      element.querySelector<T>(`#help-x-${id}`) as T;
    const change = (control: HTMLInputElement | HTMLSelectElement, value: string) => {
      control.value = value;
      control.dispatchEvent(new Event('change'));
    };

    it('shows the spec labels', () => {
      const labels = [...element.querySelectorAll('label')].map((l) => l.textContent?.trim());
      expect(labels).toEqual([
        'Font:',
        'Size:',
        'Simulated Memory Size (bytes): (default is 4096)',
        'Start address of the usable memory:',
        'Context help language:',
        'Theme:',
      ]);
      expect(element.querySelector('h1')?.textContent).toBe('Configuration');
    });

    it('offers the fixed font list and saves the choice', () => {
      const font = field<HTMLSelectElement>('font');
      expect([...font.options].map((o) => o.value)).toEqual(FONT_CHOICES.map((f) => f.name));
      expect(font.value).toBe('JetBrains Mono');
      change(font, 'Inter');
      expect(settings.get('font')).toBe('Inter');
    });

    it('saves valid numbers and reverts invalid ones', () => {
      const size = field<HTMLInputElement>('size');
      change(size, '16');
      expect(settings.get('font.size')).toBe(16);
      change(size, '0');
      expect(settings.get('font.size')).toBe(16);
      expect(size.value).toBe('16');

      const memory = field<HTMLInputElement>('memory');
      change(memory, '8192');
      expect(settings.get('memory')).toBe(8192);
    });

    it('commits the offset on Enter and reverts invalid input', () => {
      const offset = field<HTMLInputElement>('offset');
      offset.value = '0x1000';
      offset.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(settings.get('offset')).toBe(4096);
      expect(offset.value).toBe('4096');
      change(offset, 'nonsense');
      expect(settings.get('offset')).toBe(4096);
      expect(offset.value).toBe('4096');
    });

    it('saves the theme and language', () => {
      change(field<HTMLSelectElement>('theme'), 'dark');
      expect(settings.get('theme')).toBe('dark');
      expect(field<HTMLSelectElement>('language').value).toBe('en');
    });
  });
});
