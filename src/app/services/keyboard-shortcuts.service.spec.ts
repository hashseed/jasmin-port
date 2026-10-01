import { matchBinding } from './keyboard-shortcuts.service';

const key = (code: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { code, ...init });

describe('keyboard shortcuts (spec 02 §2)', () => {
  it('maps the accelerators and the browser-safe substitutes', () => {
    expect(matchBinding(key('KeyN', { altKey: true }))?.action).toBe('new');
    expect(matchBinding(key('KeyO', { ctrlKey: true }))?.action).toBe('open');
    expect(matchBinding(key('KeyS', { metaKey: true }))?.action).toBe('save');
    expect(matchBinding(key('KeyZ', { ctrlKey: true }))?.action).toBe('undo');
    expect(matchBinding(key('KeyR', { ctrlKey: true }))?.action).toBe('redo');
    expect(matchBinding(key('KeyY', { ctrlKey: true }))?.action).toBe('redo');
    expect(matchBinding(key('KeyZ', { ctrlKey: true, shiftKey: true }))?.action).toBe('redo');
    expect(matchBinding(key('F5'))?.action).toBe('run');
    expect(matchBinding(key('KeyP', { ctrlKey: true }))?.action).toBe('pause');
    expect(matchBinding(key('F7'))?.action).toBe('step');
    expect(matchBinding(key('F9'))?.action).toBe('executeLine');
  });

  it('ignores other modifier combinations', () => {
    expect(matchBinding(key('KeyN', { ctrlKey: true }))).toBeNull();
    expect(matchBinding(key('F5', { ctrlKey: true }))).toBeNull();
    expect(matchBinding(key('KeyC', { ctrlKey: true }))).toBeNull();
  });
});
