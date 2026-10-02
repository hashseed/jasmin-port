import { describe, expect, it } from 'vitest';
import { remapLines } from './line-map';
import { MachineSession, Scheduler, TimerHost, eventLoopScheduler } from './session';
import { NOT_A_MEMORY_FILE, parseSnapshot, takeSnapshot } from './snapshot';

/** A manual clock: every `now()` call advances time by 1 ms so Run slices end. */
class FakeScheduler implements Scheduler {
  time = 0;
  private timers: { at: number; callback: () => void; id: number }[] = [];
  private nextId = 1;

  setTimeout(callback: () => void, ms: number): unknown {
    const id = this.nextId++;
    this.timers.push({ at: this.time + ms, callback, id });
    return id;
  }

  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((t) => t.id !== handle);
  }

  now(): number {
    return this.time++;
  }

  get pending(): number {
    return this.timers.length;
  }

  /** Runs due timers, advancing the clock by `ms`, then returns. */
  advance(ms: number): void {
    const until = this.time + ms;
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at);
      const next = this.timers[0];
      if (!next || next.at > until) break;
      this.timers.shift();
      this.time = Math.max(this.time, next.at);
      next.callback();
    }
    this.time = Math.max(this.time, until);
  }
}

function session(source: string, scheduler = new FakeScheduler()) {
  const s = new MachineSession(undefined, scheduler, { batchSteps: 10, sliceMs: 5 });
  s.setText(source);
  return { s, scheduler };
}

const reg = (s: MachineSession, name: string) =>
  s.dsp.registers.get(s.dsp.getRegisterArgument(name)!);
const bold = (s: MachineSession, name: string) =>
  s.dsp.isDirty(s.dsp.getRegisterArgument(name)!, 1);
const eip = (s: MachineSession) => s.dsp.getInstructionPointer();

describe('change counter (spec 04 §8)', () => {
  it('marks only the last Step', () => {
    const { s } = session('mov eax, 1\nmov ebx, 2\n\nmov ecx, 3');
    s.step();
    expect([bold(s, 'EAX'), bold(s, 'EBX')]).toEqual([true, false]);
    s.step();
    expect([bold(s, 'EAX'), bold(s, 'EBX')]).toEqual([false, true]);
    s.step(); // empty line: no-op, bold state kept
    expect(bold(s, 'EBX')).toBe(true);
    s.step();
    expect([bold(s, 'EBX'), bold(s, 'ECX')]).toEqual([false, true]);
  });

  it('marks everything written during the last Run', () => {
    const { s, scheduler } = session('mov eax, 1\nmov ebx, 2\nmov ecx, 3');
    s.step();
    s.run();
    scheduler.advance(100);
    expect(s.running).toBe(false);
    expect([bold(s, 'EAX'), bold(s, 'EBX'), bold(s, 'ECX')]).toEqual([false, true, true]);
  });

  it('marks register parts: AH write is not AL', () => {
    const { s } = session('mov ah, 1');
    s.step();
    expect(s.dsp.isDirty(s.dsp.AH, 1)).toBe(true);
    expect(s.dsp.isDirty(s.dsp.AL, 1)).toBe(false);
    expect(s.dsp.isDirty(s.dsp.AX, 1)).toBe(false);
  });

  it('does not advance on an exception-type error', () => {
    const { s } = session('mov eax, 1\nmov ebx, 0\ndiv ebx');
    s.step();
    s.step();
    s.step();
    expect(s.error).toBe('Division by zero');
    expect(bold(s, 'EBX')).toBe(true);
  });

  it('Reset clears all stamps', () => {
    const { s } = session('mov eax, 1');
    s.step();
    s.reset();
    expect(bold(s, 'EAX')).toBe(false);
  });
});

describe('Step, Execute current line, Stop, Reset (spec 04 §9)', () => {
  it('leaves EIP on a failing line and shows the error (07 Q-E-1)', () => {
    const { s } = session('mov eax, 1\npop eax');
    s.step();
    s.step();
    expect(eip(s)).toBe(1);
    expect(s.error).toBe('Memory address out of range. Might be a stack over-/underflow.');
    s.setInstructionPointer(0);
    s.step();
    expect(s.error).toBeNull();
  });

  it('Execute current line keeps EIP unless the line jumps', () => {
    const { s } = session('mov eax, 7\nnop\ntarget: jmp target');
    s.executeLine(0);
    expect([reg(s, 'EAX'), eip(s)]).toEqual([7, 0]);
    s.executeLine(2);
    expect(eip(s)).toBe(2);
  });

  it('Stop sets EIP to 0 and keeps registers', () => {
    const { s } = session('mov eax, 7\nnop');
    s.step();
    s.step();
    s.stop();
    expect([reg(s, 'EAX'), eip(s)]).toEqual([7, 0]);
  });

  it('Reset clears the machine, re-parses and keeps breakpoints', () => {
    const { s } = session('x: db 5\nmov eax, [x]');
    s.toggleBreakpoint(1);
    s.step();
    s.step();
    s.reset();
    expect([reg(s, 'EAX'), eip(s), reg(s, 'ESP')]).toEqual([0, 0, 4096]);
    expect(s.dsp.isVariable('X')).toBe(true);
    expect([...s.breakpoints]).toEqual([1]);
  });
});

describe('Run (spec 04 §9.3)', () => {
  it('stops on a breakpoint, and ignores the one it starts on', () => {
    const { s, scheduler } = session('inc eax\ninc eax\ninc eax\ninc eax');
    s.toggleBreakpoint(2);
    s.run();
    scheduler.advance(100);
    expect([s.running, eip(s), reg(s, 'EAX')]).toEqual([false, 2, 2]);
    s.run();
    scheduler.advance(100);
    expect([eip(s), reg(s, 'EAX')]).toEqual([4, 4]);
  });

  it('stops on an error with EIP on the failing line', () => {
    const { s, scheduler } = session('mov eax, 1\npop ebx\nmov ecx, 1');
    s.run();
    scheduler.advance(100);
    expect([s.running, eip(s), reg(s, 'ECX')]).toEqual([false, 1, 0]);
    expect(s.error).toMatch(/stack over-\/underflow/);
  });

  it('keeps an infinite loop pausable', () => {
    const { s, scheduler } = session('top: inc eax\njmp top');
    const events: boolean[] = [];
    s.subscribe((e) => e.kind === 'running' && events.push(e.running));
    s.run();
    scheduler.advance(1000);
    expect(s.running).toBe(true);
    expect(reg(s, 'EAX')).toBeGreaterThan(100);
    s.pause();
    expect(s.running).toBe(false);
    expect(scheduler.pending).toBe(0);
    expect(events).toEqual([true, false]);
    const eax = reg(s, 'EAX');
    scheduler.advance(1000);
    expect(reg(s, 'EAX')).toBe(eax);
  });

  it('stops at a breakpoint set while running (compiled code knows only the old ones)', () => {
    // Five lines: every batch of 10 lines runs whole iterations of compiled code.
    const { s, scheduler } = session('top: inc eax\nadd ebx, 2\nnop\nnop\njmp top');
    s.run();
    scheduler.advance(200);
    expect(s.running).toBe(true);
    s.toggleBreakpoint(1);
    scheduler.advance(200);
    expect([s.running, eip(s), reg(s, 'EBX')]).toEqual([false, 1, 2 * reg(s, 'EAX') - 2]);
  });

  it('refreshes the panels while running, at most every 100 ms', () => {
    const { s, scheduler } = session('top: inc eax\njmp top');
    const seen: number[] = [];
    s.subscribe((e) => e.kind === 'refresh' && seen.push(reg(s, 'EAX')));
    s.run();
    scheduler.advance(1000);
    expect(seen.length).toBeGreaterThanOrEqual(5);
    expect(seen.length).toBeLessThanOrEqual(10);
    // Each refresh shows the registers as they are at that moment.
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1]);
    s.pause();
  });

  it('waits for JASMINSLEEP, and Pause cuts it short', () => {
    const { s, scheduler } = session('jasminsleep 500\nmov eax, 1');
    s.run();
    scheduler.advance(100);
    expect([s.running, reg(s, 'EAX')]).toEqual([true, 0]);
    scheduler.advance(500);
    expect([s.running, reg(s, 'EAX')]).toEqual([false, 1]);

    s.reset();
    s.run();
    scheduler.advance(100);
    s.pause();
    expect([s.running, eip(s), scheduler.pending]).toEqual([false, 1, 0]);
  });

  it('Step ignores JASMINSLEEP', () => {
    const { s } = session('jasminsleep 500\nmov eax, 1');
    s.step();
    expect(s.dsp.pendingSleepMs).toBe(0);
  });

  it('Reset while running pauses first', () => {
    const { s, scheduler } = session('top: inc eax\njmp top');
    s.run();
    scheduler.advance(50);
    s.reset();
    expect([s.running, reg(s, 'EAX'), scheduler.pending]).toEqual([false, 0, 0]);
  });
});

describe('breakpoints move with their line (07 Q-UI-2)', () => {
  const lines = (text: string) => text.split('\n');
  it.each([
    ['insert a line above', 'a\nb\nc', 'x\na\nb\nc', [1], [2]],
    ['Enter at the end of the line above', 'a\nb\nc', 'a\n\nb\nc', [1], [2]],
    ['Enter at the start of the line', 'a\nb\nc', 'a\n\nb\nc', [2], [3]],
    ['edit the line itself', 'a\nb\nc', 'a\nbb\nc', [1], [1]],
    ['split the line', 'a\nbc\nd', 'a\nb\nc\nd', [1, 2], [1, 3]],
    ['delete the line', 'a\nb\nc', 'a\nc', [1], []],
    ['delete a line above', 'a\nb\nc', 'b\nc', [2], [1]],
    ['change below', 'a\nb\nc', 'a\nb\nc\nd', [0, 2], [0, 2]],
  ])('%s', (_name, before, after, from, to) => {
    expect([...remapLines(lines(before), lines(after), from)].sort()).toEqual(to);
  });

  it('applies when the session text changes', () => {
    const { s } = session('nop\nnop\ninc eax');
    s.toggleBreakpoint(2);
    s.setText('nop\nmov ebx, 1\nnop\ninc eax');
    expect([...s.breakpoints]).toEqual([3]);
    s.setText('nop\nmov ebx, 1\nnop');
    expect([...s.breakpoints]).toEqual([]);
  });
});

describe('snapshots and .mem files (spec 04 §9.10, 09 §4.3)', () => {
  const program = [
    'msg: db 1, 2, 3',
    'big: equ 5',
    'mov eax, msg',
    'mov ebx, done',
    'fld1',
    'fldz',
    'push 0x12345678',
    'done: nop',
  ].join('\n');

  function prepared() {
    const { s, scheduler } = session(program);
    s.run();
    scheduler.advance(100);
    const fpu = s.dsp.fpu;
    fpu.registers[2] = NaN;
    fpu.registers[3] = Infinity;
    fpu.registers[4] = -0;
    fpu.status.C3 = true;
    s.dsp.fCarry = true;
    s.dsp.setConstantValue('BIG', 2n ** 62n);
    return s;
  }

  it('Take/Load Snapshot restores memory, registers, flags, symbols and FPU', () => {
    const s = prepared();
    s.takeSnapshot();
    const before = takeSnapshot(s.dsp);
    s.reset();
    s.dsp.fpu.clear();
    s.loadSnapshot();
    expect(takeSnapshot(s.dsp)).toEqual(before);
    expect(bold(s, 'EAX')).toBe(false);
  });

  it('round-trips a .mem file including NaN, Infinity and -0 in the FPU', () => {
    const s = prepared();
    const text = s.saveMemory();
    const json = JSON.parse(text);
    expect(json.format).toBe('jasmin-mem');
    expect(json.constants.BIG).toBe('4611686018427387904');
    expect(json.variables.MSG).toBe(0);
    expect(json.registers.ESP).toBe(4092);
    expect(json.labelCells).toContainEqual({ kind: 'register', register: 'EBX', label: 'DONE' });

    const { s: other } = session('');
    expect(other.loadMemory(text)).toBe(true);
    expect(takeSnapshot(other.dsp)).toEqual(takeSnapshot(s.dsp));
    const r = other.dsp.fpu.registers;
    expect([Number.isNaN(r[2]), r[3], Object.is(r[4], -0)]).toEqual([true, Infinity, true]);
    expect(other.dsp.getConstant('BIG')).toBe(2n ** 62n);
  });

  it('replaces the machine when the memory size differs', () => {
    const s = prepared();
    const text = s.saveMemory();
    const other = new MachineSession({ memorySize: 64, offset: 16 }, new FakeScheduler());
    other.setText('nop');
    const events: string[] = [];
    other.subscribe((e) => events.push(e.kind));
    expect(other.loadMemory(text)).toBe(true);
    expect([other.dsp.memorySize, other.dsp.offset, other.program.text]).toEqual([4096, 0, 'nop']);
    expect(events).toEqual(['machine-replaced', 'refresh']);
  });

  it.each([
    ['not JSON', 'PK\u0003\u0004'],
    ['wrong format', '{"format":"other","version":1}'],
    ['wrong version', (t: string) => t.replace('"version": 1', '"version": 2')],
    ['short memory', (t: string) => t.replace(/"memory": "[^"]*"/, '"memory": "AAAA"')],
    ['bad register', (t: string) => t.replace(/"EAX": \d+/, '"EAX": -1')],
    ['bad FPU hex', (t: string) => t.replace(/"top": \d/, '"top": 9')],
  ])('rejects %s and changes nothing', (_name, edit) => {
    const s = prepared();
    const text = typeof edit === 'string' ? edit : edit(s.saveMemory());
    expect(parseSnapshot(text)).toBeNull();
    const before = takeSnapshot(s.dsp);
    expect(s.loadMemory(text)).toBe(false);
    expect(takeSnapshot(s.dsp)).toEqual(before);
    expect(NOT_A_MEMORY_FILE).toBe('Not a Jasmin memory file.');
  });
});

describe('event-loop scheduler', () => {
  /** Timer functions of this event loop, without `setImmediate` if `immediate` is false. */
  function host(immediate: boolean): { host: TimerHost; timeouts: number[] } {
    const timeouts: number[] = [];
    return {
      timeouts,
      host: {
        setTimeout: (callback, ms) => {
          timeouts.push(ms);
          return globalThis.setTimeout(callback, ms);
        },
        clearTimeout: (handle) => globalThis.clearTimeout(handle as never),
        setImmediate: immediate ? (globalThis as TimerHost).setImmediate : undefined,
        MessageChannel: globalThis.MessageChannel,
      },
    };
  }

  it.each([
    ['setImmediate', true],
    ['MessageChannel', false],
  ])('yields with %s, in order, and cancels', async (_name, immediate) => {
    const { host: h, timeouts } = host(immediate);
    const scheduler = eventLoopScheduler(h);
    const calls: string[] = [];
    await new Promise<void>((done) => {
      scheduler.setTimeout(() => calls.push('a'), 0);
      const cancelled = scheduler.setTimeout(() => calls.push('cancelled'), 0);
      scheduler.setTimeout(() => calls.push('b'), 0);
      scheduler.clearTimeout(cancelled);
      const delayed = scheduler.setTimeout(() => calls.push('delayed'), 5);
      scheduler.clearTimeout(delayed);
      scheduler.setTimeout(() => {
        calls.push('timer');
        done();
      }, 10);
    });
    expect(calls).toEqual(['a', 'b', 'timer']);
    // Only the real delays went to setTimeout.
    expect(timeouts).toEqual([5, 10]);
  });

  it.each([true, false])(
    'runs a program to the end and pauses (setImmediate: %s)',
    async (immediate) => {
      const scheduler = eventLoopScheduler(host(immediate).host);
      const finite = new MachineSession(undefined, scheduler, { sliceMs: 2 });
      finite.setText('mov ecx, 20000\nl: add eax, 1\nloop l');
      const ended = new Promise<void>((done) =>
        finite.subscribe((e) => e.kind === 'running' && !e.running && done()),
      );
      finite.run();
      await ended;
      expect(reg(finite, 'EAX')).toBe(20000);

      const endless = new MachineSession(undefined, scheduler, { sliceMs: 2 });
      endless.setText('l: add eax, 1\njmp l');
      endless.run();
      await new Promise((done) => globalThis.setTimeout(done, 30));
      endless.pause();
      const eax = reg(endless, 'EAX');
      expect(eax).toBeGreaterThan(0);
      expect(endless.running).toBe(false);
      await new Promise((done) => globalThis.setTimeout(done, 20));
      expect(reg(endless, 'EAX')).toBe(eax);
    },
  );
});
