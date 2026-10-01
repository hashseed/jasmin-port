import { TestBed } from '@angular/core/testing';
import { App } from './app';

describe('App', () => {
  beforeEach(() => localStorage.clear());

  it('renders the menu bar, the toolbar and the Welcome tab', async () => {
    await TestBed.configureTestingModule({ imports: [App] }).compileComponents();
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    const menus = [...element.querySelectorAll('[cdkMenuBar] > button')].map((m) =>
      m.textContent?.trim(),
    );
    expect(menus).toEqual(['File', 'Edit', 'Run']);
    expect(element.querySelector('[role=tab]')?.textContent).toContain('Welcome');
    const tools = [...element.querySelectorAll('app-toolbar button')].map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(tools).toEqual([
      'Create a new Document',
      'Open Sourcecode',
      'Save Sourcecode',
      'Undo',
      'Redo',
      'Cut',
      'Copy',
      'Paste',
      'Go back',
      'Go forward',
      'Run the program',
      'Execute the next command',
      'Execute the line at the caret position without modifying the instruction pointer',
      'Stop the program',
      'Reset the memory and all registers',
      'Take Snapshot',
      'Load Snapshot',
    ]);
  });
});
