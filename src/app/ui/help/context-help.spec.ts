import { TestBed } from '@angular/core/testing';
import { MachineSession } from '../../core';
import { DocumentStore } from '../../services/document-store';
import { ContextHelp } from './context-help';
import { HELP_FETCH } from './help-content.service';

const FILES: Record<string, string> = {
  'help/en/index.json': JSON.stringify({ mov: 'MOV.htm', add: 'ADD.htm' }),
  'help/en/MOV.htm':
    '<html><head><title>MOV.htm</title></head><body><div style="color:red">' +
    '<strong>Command:</strong> MOV-Move<br>See <a href="ADD.htm">ADD</a>' +
    '<script>window.hacked = true</script></div></body></html>',
  'help/en/ADD.htm': '<html><body><div><strong>Command:</strong> ADD-Add</div></body></html>',
};

describe('ContextHelp', () => {
  let doc: DocumentStore;
  let fetched: string[];

  beforeEach(() => {
    localStorage.clear();
    fetched = [];
    TestBed.configureTestingModule({
      providers: [
        {
          provide: HELP_FETCH,
          useValue: async (path: string) => {
            fetched.push(path);
            if (!(path in FILES)) throw new Error(`404 ${path}`);
            return FILES[path];
          },
        },
      ],
    });
    doc = new DocumentStore(new MachineSession());
    doc.setText('mov eax, 1\nfabs\n\nlabel:\n; comment\nfoo eax\n  MoV ebx, eax');
  });

  async function render() {
    const fixture = TestBed.createComponent(ContextHelp);
    fixture.componentRef.setInput('doc', doc);
    const element = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        await new Promise((resolve) => setTimeout(resolve));
      }
    };
    await settle();
    return { fixture, element, settle };
  }

  const pageText = (element: HTMLElement) =>
    element.querySelector('.context-help-page:not([hidden])')?.textContent?.trim() ?? null;
  const noneText = (element: HTMLElement) =>
    element.querySelector('.context-help-none')?.textContent?.trim() ?? null;

  it('follows the caret line: page, missing page, no mnemonic (spec 02 §11)', async () => {
    const { element, settle } = await render();
    expect(pageText(element)).toBe('Command: MOV-MoveSee ADD');
    expect(noneText(element)).toBeNull();

    doc.caretLine.set(1);
    await settle();
    expect(pageText(element)).toBeNull();
    expect(noneText(element)).toBe('No help found for FABS');

    for (const line of [2, 3, 4, 5]) {
      doc.caretLine.set(line);
      await settle();
      expect(noneText(element)).toBe('No help available for current context.');
    }

    // Case-insensitive, and pages are fetched once.
    doc.caretLine.set(6);
    await settle();
    expect(pageText(element)).toContain('MOV-Move');
    expect(fetched.filter((p) => p.endsWith('MOV.htm'))).toEqual(['help/en/MOV.htm']);
  });

  it('renders pages inert: no scripts or inline styles', async () => {
    const { element } = await render();
    const page = element.querySelector('.context-help-page')!;
    expect(page.querySelector('script')).toBeNull();
    expect(page.querySelector('[style]')).toBeNull();
    expect((window as { hacked?: boolean }).hacked).toBeUndefined();
  });

  it('opens linked help pages in the pane until the mnemonic changes', async () => {
    const { element, settle } = await render();
    element.querySelector<HTMLAnchorElement>('.context-help-page a')!.click();
    await settle();
    expect(pageText(element)).toBe('Command: ADD-Add');

    doc.caretLine.set(6); // also MOV: the linked page stays
    await settle();
    expect(pageText(element)).toBe('Command: ADD-Add');

    doc.caretLine.set(1);
    await settle();
    expect(noneText(element)).toBe('No help found for FABS');
    doc.caretLine.set(0);
    await settle();
    expect(pageText(element)).toContain('MOV-Move');
  });

  it('re-reads the mnemonic when the caret line is re-parsed', async () => {
    const { element, settle } = await render();
    doc.setText('add eax, 1');
    await settle();
    expect(pageText(element)).toBe('Command: ADD-Add');
  });
});
