import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  it('renders the menu bar and the Welcome tab', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const menus = [...element.querySelectorAll('.menu')].map((m) => m.textContent?.trim());
    expect(menus).toEqual(['File', 'Edit', 'Run']);
    expect(element.querySelector('[role=tab]')?.textContent).toContain('Welcome');
  });
});
