import { TestBed } from '@angular/core/testing';
import { SettingsService } from './settings.service';
import { frozenSessionFactory } from './test-session';
import { SESSION_FACTORY, WorkspaceService } from './workspace.service';

describe('WorkspaceService', () => {
  let workspace: WorkspaceService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_FACTORY, useValue: frozenSessionFactory }],
    });
    workspace = TestBed.inject(WorkspaceService);
  });

  it('appends and selects new tabs titled "new document" (spec 09 §2)', () => {
    workspace.openHelp('welcome');
    const a = workspace.newDocument();
    const b = workspace.newDocument();
    expect(workspace.tabs().length).toBe(3);
    expect(a.title()).toBe('new document');
    expect(b.title()).toBe('new document');
    expect(workspace.document()).toBe(b);
  });

  it('closing the selected tab selects the tab now at its index', () => {
    const help = workspace.openHelp('welcome');
    const a = workspace.newDocument();
    const b = workspace.newDocument();
    workspace.select(`doc-${a.id}`);
    workspace.closeSelected();
    expect(workspace.document()).toBe(b);
    workspace.closeSelected();
    expect(workspace.help()).toBe(help);
    workspace.closeSelected();
    expect(workspace.selected()).toBeNull();
  });

  it('closing a running document stops it', () => {
    const doc = workspace.newDocument('loop', 'l: jmp l');
    doc.run();
    expect(doc.running()).toBe(true);
    workspace.closeAll();
    expect(doc.session.running).toBe(false);
  });

  it('new documents take memory size and split locations from the settings', () => {
    const settings = TestBed.inject(SettingsService);
    settings.set('memory', 8192);
    settings.set('split2.location', 280);
    const doc = workspace.newDocument();
    expect(doc.session.dsp.memorySize).toBe(8192);
    expect(doc.layout.split2()).toBe(280);
    expect(doc.layout.split1()).toBeNull();
  });
});
