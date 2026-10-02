import { describe, expect, it } from 'vitest';
import { Memory, MemoryRange } from './memory';

function watched(memory: Memory, ranges?: readonly MemoryRange[]) {
  const writes: string[] = [];
  const listener = (address: number, value: number) => writes.push(`${address}=${value}`);
  const remove = memory.addListener(listener, ranges);
  return { writes, listener, remove };
}

describe('Memory write listeners', () => {
  it('without ranges hear every write, byte by byte', () => {
    const memory = new Memory(64, 0);
    const { writes } = watched(memory);
    memory.set(3, 0x1ff);
    memory.setLittleEndian(10, 0x04030201, 4);
    expect(writes).toEqual(['3=255', '10=1', '11=2', '12=3', '13=4']);
    expect(memory.isWatched(60, 4)).toBe(true);
  });

  it('with ranges hear only the bytes inside them', () => {
    const memory = new Memory(64, 0);
    const { writes } = watched(memory, [
      { start: 8, end: 12 },
      { start: 20, end: 21 },
    ]);
    memory.set(7, 1);
    memory.set(8, 2);
    memory.set(11, 3);
    memory.set(12, 4);
    memory.set(20, 5);
    memory.setLittleEndian(0, 0xffffffff, 4);
    memory.setLittleEndian(24, 0xffffffff, 4);
    memory.setLittleEndian(14, 0xffffffff, 4);
    expect(writes).toEqual(['8=2', '11=3', '20=5']);
    // The bytes are written all the same.
    expect([...memory.bytes.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect(memory.isDirty(25, 0)).toBe(true);
  });

  it('a write straddling a range edge reports the watched bytes', () => {
    const memory = new Memory(64, 0);
    const { writes } = watched(memory, [{ start: 10, end: 12 }]);
    memory.setLittleEndian(8, 0x44332211, 4);
    memory.setLittleEndian(11, 0x8877, 2);
    expect(writes).toEqual(['10=51', '11=68', '11=119']);
    expect(memory.isWatched(8, 2)).toBe(false);
    expect(memory.isWatched(8, 3)).toBe(true);
    expect(memory.isWatched(11, 4)).toBe(true);
    expect(memory.isWatched(12, 4)).toBe(false);
  });

  it('follows moved ranges, even during a write', () => {
    const memory = new Memory(64, 0x100);
    const writes: string[] = [];
    // Grows its range by one byte per write, like the array Console extending its string.
    let end = 0x101;
    const listener = (address: number, value: number) => {
      writes.push(`${address.toString(16)}=${value}`);
      end = address + 2;
      memory.watch(listener, [{ start: 0x100, end }]);
    };
    memory.addListener(listener, [{ start: 0x100, end }]);
    memory.setLittleEndian(0x100, 0x04030201, 4);
    expect(writes).toEqual(['100=1', '101=2', '102=3', '103=4']);
    writes.length = 0;
    memory.watch(listener, [{ start: 0x120, end: 0x121 }]);
    memory.set(0x100, 9);
    memory.set(0x120, 8);
    expect(writes).toEqual(['120=8']);
  });

  it('merges the ranges of several listeners and forgets removed ones', () => {
    const memory = new Memory(64, 0);
    const a = watched(memory, [{ start: 0, end: 4 }]);
    const b = watched(memory, [
      { start: 2, end: 6 },
      { start: 30, end: 30 },
    ]);
    memory.setLittleEndian(3, 0x0201, 2);
    expect(a.writes).toEqual(['3=1']);
    expect(b.writes).toEqual(['3=1', '4=2']);
    expect(memory.isWatched(6, 4)).toBe(false);
    // An empty range watches nothing.
    expect(memory.isWatched(30, 1)).toBe(false);
    a.remove();
    b.remove();
    memory.set(3, 0);
    expect(memory.isWatched(0, 64)).toBe(false);
    expect(a.writes).toHaveLength(1);
    // Changing the ranges of a removed listener does not bring it back.
    memory.watch(a.listener, [{ start: 0, end: 64 }]);
    expect(memory.isWatched(0, 64)).toBe(false);
  });
});
