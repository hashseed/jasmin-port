import { TestBed } from '@angular/core/testing';
import { ActionId, ActionsService } from './actions.service';
import { frozenSessionFactory } from './test-session';
import { SESSION_FACTORY, WorkspaceService } from './workspace.service';

const ALL: ActionId[] = [
  'new',
  'open',
  'save',
  'saveMemory',
  'loadMemory',
  'closeDocument',
  'configuration',
  'exit',
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'back',
  'forward',
  'run',
  'pause',
  'runPause',
  'step',
  'executeLine',
  'stop',
  'reset',
  'takeSnapshot',
  'loadSnapshot',
  'closeTab',
];

function enabledSet(actions: ActionsService): ActionId[] {
  return ALL.filter((id) => actions.actions[id].enabled());
}

describe('ActionsService enablement (spec 02 §4)', () => {
  let actions: ActionsService;
  let workspace: WorkspaceService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SESSION_FACTORY, useValue: frozenSessionFactory }],
    });
    actions = TestBed.inject(ActionsService);
    workspace = TestBed.inject(WorkspaceService);
  });

  it('help tab: only the always-enabled actions', () => {
    workspace.openHelp('welcome');
    expect(enabledSet(actions)).toEqual([
      'new',
      'open',
      'loadMemory',
      'configuration',
      'exit',
      'closeTab',
    ]);
    expect(actions.editMenuEnabled()).toBe(false);
    expect(actions.runMenuEnabled()).toBe(false);
  });

  it('help tab: back and forward follow the tab history', () => {
    const help = workspace.openHelp('welcome');
    help.navigate('configuration');
    expect(actions.actions.back.enabled()).toBe(true);
    expect(actions.actions.forward.enabled()).toBe(false);
    actions.execute('back');
    expect(help.page()).toBe('welcome');
    expect(actions.actions.forward.enabled()).toBe(true);
  });

  it('document idle', () => {
    workspace.newDocument();
    expect(enabledSet(actions)).toEqual([
      'new',
      'open',
      'save',
      'saveMemory',
      'loadMemory',
      'closeDocument',
      'configuration',
      'exit',
      'paste',
      'run',
      'runPause',
      'step',
      'executeLine',
      'stop',
      'reset',
      'takeSnapshot',
      'closeTab',
    ]);
    expect(actions.editMenuEnabled()).toBe(true);
    expect(actions.runMenuEnabled()).toBe(true);
  });

  it('document idle: undo, redo, cut, copy and load snapshot follow the document', () => {
    const doc = workspace.newDocument();
    doc.canUndo.set(true);
    doc.hasSelection.set(true);
    expect(actions.actions.undo.enabled()).toBe(true);
    expect(actions.actions.redo.enabled()).toBe(false);
    expect(actions.actions.cut.enabled()).toBe(true);
    expect(actions.actions.copy.enabled()).toBe(true);
    expect(actions.actions.loadSnapshot.enabled()).toBe(false);
    actions.execute('takeSnapshot');
    expect(actions.actions.loadSnapshot.enabled()).toBe(true);
  });

  it('document running: Run/Pause, Stop, Reset and the Pause menu item (07 Q-UI-1)', () => {
    const doc = workspace.newDocument('loop', 'l: jmp l');
    doc.canUndo.set(true);
    doc.hasSelection.set(true);
    doc.takeSnapshot();
    actions.execute('run');
    expect(doc.running()).toBe(true);
    expect(actions.isRunning()).toBe(true);
    expect(enabledSet(actions)).toEqual([
      'new',
      'open',
      'loadMemory',
      'configuration',
      'exit',
      'pause',
      'runPause',
      'stop',
      'reset',
      'closeTab',
    ]);
    expect(actions.editMenuEnabled()).toBe(false);
    expect(actions.runMenuEnabled()).toBe(true);

    actions.execute('pause');
    expect(doc.running()).toBe(false);
    expect(actions.actions.run.enabled()).toBe(true);
  });

  it('the Run/Pause toggle pauses a running document', () => {
    const doc = workspace.newDocument('loop', 'l: jmp l');
    actions.execute('runPause');
    expect(doc.running()).toBe(true);
    actions.execute('runPause');
    expect(doc.running()).toBe(false);
  });

  it('disabled actions do not run', () => {
    workspace.openHelp('welcome');
    expect(actions.execute('step')).toBe(false);
  });
});
