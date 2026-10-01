import { MachineSession } from '../../../core';
import { registerViews, writeRegister } from './register-view';

function run(program: string, steps: number): MachineSession {
  const session = new MachineSession();
  session.setText(program);
  for (let i = 0; i < steps; i++) session.step();
  return session;
}

const view = (session: MachineSession, name: string, radix: 'hex' | 'sdec' = 'hex') =>
  registerViews(session.dsp, radix).find((r) => r.name === name)!;

describe('register rows (spec 02 §7.2)', () => {
  it('lists the nine registers with their alias names', () => {
    const views = registerViews(new MachineSession().dsp, 'sdec');
    expect(views.map((v) => v.name)).toEqual([
      'EAX',
      'EBX',
      'ECX',
      'EDX',
      'ESI',
      'EDI',
      'ESP',
      'EBP',
      'EIP',
    ]);
    expect([views[0].x, views[0].h, views[0].l]).toEqual(['AX', 'AH', 'AL']);
    expect([views[4].x, views[4].h, views[4].l]).toEqual(['SI', '', '']);
    expect([views[8].x, views[8].h, views[8].l]).toEqual(['', '', '']);
    expect(views[6].text).toBe('4096');
  });

  it('splits the value into bytes, most significant first', () => {
    const session = run('mov eax, 0x12345678', 1);
    const eax = view(session, 'EAX');
    expect(eax.text).toBe('0x12345678');
    expect(eax.bytes.map((b) => b.text)).toEqual(['0x12', '0x34', '0x56', '0x78']);
    expect(eax.bytes.map((b) => b.index)).toEqual([3, 2, 1, 0]);
  });

  it('marks every byte after a 32-bit write', () => {
    const eax = view(run('mov eax, 1', 1), 'EAX');
    expect(eax.changed).toBe(true);
    expect(eax.bytes.every((b) => b.changed)).toBe(true);
  });

  it('marks only the written part (spec 04 §8)', () => {
    const al = view(run('mov eax, 1\nmov al, 2', 2), 'EAX');
    expect(al.changed).toBe(true);
    expect(al.bytes.map((b) => b.changed)).toEqual([false, false, false, true]);

    const ah = view(run('mov eax, 1\nmov ah, 2', 2), 'EAX');
    expect(ah.bytes.map((b) => b.changed)).toEqual([false, false, true, false]);

    const ax = view(run('mov eax, 1\nmov ax, 2', 2), 'EAX');
    expect(ax.bytes.map((b) => b.changed)).toEqual([false, false, true, true]);

    const si = view(run('mov esi, 1\nmov si, 2', 2), 'ESI');
    expect(si.bytes.map((b) => b.changed)).toEqual([false, false, true, true]);
  });

  it('is plain again after a step that does not touch it', () => {
    const eax = view(run('mov eax, 1\nnop', 2), 'EAX');
    expect(eax.changed).toBe(false);
    expect(eax.bytes.some((b) => b.changed)).toBe(false);
  });
});

describe('register editing', () => {
  it('writes the whole register from the collapsed field', () => {
    const session = new MachineSession();
    const eax = view(session, 'EAX');
    expect(writeRegister(session.dsp, eax.set, '-1', 'sdec', null)).toBe(true);
    expect(view(session, 'EAX').text).toBe('0xFFFFFFFF');
  });

  it('replaces one byte from a byte field', () => {
    const session = run('mov ecx, 0xAABBCCDD', 1);
    const ecx = view(session, 'ECX');
    expect(writeRegister(session.dsp, ecx.set, '11', 'hex', 2)).toBe(true);
    expect(view(session, 'ECX').text).toBe('0xAA11CCDD');
    expect(writeRegister(session.dsp, ecx.set, '0x1FF', 'hex', 0)).toBe(true);
    expect(view(session, 'ECX').text).toBe('0xAA11CCFF');
  });

  it('ignores invalid text', () => {
    const session = new MachineSession();
    const ebx = view(session, 'EBX');
    expect(writeRegister(session.dsp, ebx.set, 'xyz', 'dec', null)).toBe(false);
    expect(view(session, 'EBX').text).toBe('0x00000000');
  });

  it('feeds the next step', () => {
    const session = new MachineSession();
    session.setText('mov ebx, eax');
    writeRegister(session.dsp, view(session, 'EAX').set, '7', 'sdec', null);
    session.step();
    expect(view(session, 'EBX', 'sdec').text).toBe('7');
  });
});
