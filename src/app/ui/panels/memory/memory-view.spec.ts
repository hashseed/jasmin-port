import { MachineSession } from '../../../core';
import {
  MemoryTableOptions,
  memoryRowCount,
  memoryRows,
  rowAddress,
  writeMemory,
} from './memory-view';

const OPTIONS: MemoryTableOptions = {
  width: 4,
  descending: false,
  hexAddress: true,
  highlight: false,
};

function run(program: string, steps: number): MachineSession {
  const session = new MachineSession();
  session.setText(program);
  for (let i = 0; i < steps; i++) session.step();
  return session;
}

describe('memory table rows (spec 02 §10.2)', () => {
  it('has memorySize / width rows, ascending or descending', () => {
    const dsp = new MachineSession({ memorySize: 64, offset: 0x100 }).dsp;
    expect(memoryRowCount(dsp, 4)).toBe(16);
    expect(memoryRowCount(dsp, 1)).toBe(64);
    expect(rowAddress(dsp, 0, 4, false)).toBe(0x100);
    expect(rowAddress(dsp, 1, 2, false)).toBe(0x102);
    expect(rowAddress(dsp, 0, 4, true)).toBe(0x13c);
    const rows = memoryRows(dsp, 0, 2, { ...OPTIONS, hexAddress: false });
    expect(rows.map((r) => r.addressText)).toEqual(['256', '260']);
  });

  it('shows little-endian values in three formats', () => {
    const session = run('mov eax, -2\nmov [4], eax', 2);
    const [row] = memoryRows(session.dsp, 1, 2, OPTIONS);
    expect(row).toMatchObject({
      address: 4,
      addressText: '0x4',
      signed: '-2',
      unsigned: '4294967294',
      hex: '0xFFFFFFFE',
      changed: true,
    });
    const bytes = memoryRows(session.dsp, 4, 8, { ...OPTIONS, width: 1 });
    expect(bytes.map((r) => r.hex)).toEqual(['0xFE', '0xFF', '0xFF', '0xFF']);
    expect(bytes.map((r) => r.signed)).toEqual(['-2', '-1', '-1', '-1']);
  });

  it('is bold only for rows written in the last step', () => {
    const session = run('mov byte [9], 1\nnop', 1);
    const rows = memoryRows(session.dsp, 0, 4, OPTIONS);
    expect(rows.map((r) => r.changed)).toEqual([false, false, true, false]);
    session.step();
    expect(memoryRows(session.dsp, 2, 3, OPTIONS)[0].changed).toBe(false);
  });

  it('tints rows at or above ESP as stack', () => {
    const session = run('push 1', 1);
    const count = memoryRowCount(session.dsp, 4);
    const rows = memoryRows(session.dsp, count - 2, count, OPTIONS);
    expect(rows.map((r) => [r.address, r.stack])).toEqual([
      [4088, false],
      [4092, true],
    ]);
  });

  it('colors rows that registers point to, first register first', () => {
    const session = run('mov esi, 8\nmov ecx, 8\nmov eax, 4\nmov ebx, 4', 4);
    session.dsp.put(5n, session.dsp.EDX, null);
    const rows = memoryRows(session.dsp, 0, 3, { ...OPTIONS, highlight: true });
    // EDX = 5, EDI = 0: row 0 is EDI's (the only one at 0).
    expect(rows.map((r) => r.color)).toEqual([
      'var(--reg-edi)',
      'var(--reg-eax)',
      'var(--reg-ecx)',
    ]);
    expect(memoryRows(session.dsp, 0, 3, OPTIONS).every((r) => r.color === null)).toBe(true);
  });

  it('gives ESP, EBP and EIP no color', () => {
    const session = new MachineSession({ memorySize: 64, offset: 0 });
    session.dsp.put(1n, session.dsp.EAX, null);
    session.dsp.put(1n, session.dsp.EBX, null);
    session.dsp.put(1n, session.dsp.ECX, null);
    session.dsp.put(1n, session.dsp.EDX, null);
    session.dsp.put(1n, session.dsp.ESI, null);
    session.dsp.put(1n, session.dsp.EDI, null);
    session.dsp.put(0n, session.dsp.ESP, null);
    const [row] = memoryRows(session.dsp, 0, 1, { ...OPTIONS, highlight: true });
    expect(row.color).toBeNull();
  });
});

describe('memory editing', () => {
  it('writes width bytes little-endian at the row address', () => {
    const session = new MachineSession();
    const dsp = session.dsp;
    expect(writeMemory(dsp, 8, 4, 'hex', '11223344')).toBe(true);
    expect([8, 9, 10, 11].map((a) => dsp.memory.get(a))).toEqual([0x44, 0x33, 0x22, 0x11]);
    expect(writeMemory(dsp, 8, 1, 'signed', '-1')).toBe(true);
    expect(dsp.memory.get(8)).toBe(0xff);
    expect(dsp.memory.get(9)).toBe(0x33);
    expect(writeMemory(dsp, 12, 2, 'unsigned', '0x1234')).toBe(true);
    expect(memoryRows(dsp, 6, 7, { ...OPTIONS, width: 2 })[0].hex).toBe('0x1234');
  });

  it('ignores invalid text', () => {
    const dsp = new MachineSession().dsp;
    expect(writeMemory(dsp, 0, 4, 'signed', 'hello')).toBe(false);
    expect(dsp.memory.get(0)).toBe(0);
  });
});
