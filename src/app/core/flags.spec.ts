import { describe, expect, it } from 'vitest';
import { DataSpace, FlagState } from './data-space';
import { Flag } from './flags';
import { Interpreter } from './interpreter';
import { Program } from './program';
import { MachineSession, Scheduler } from './session';
import { restoreSnapshot, takeSnapshot } from './snapshot';

const ALL = Flag.CF | Flag.OF | Flag.SF | Flag.ZF | Flag.PF | Flag.AF;

/** The flags as a compact string, e.g. `CF ZF PF`. */
function flagString(flags: FlagState): string {
  return (['CF', 'OF', 'SF', 'ZF', 'PF', 'AF', 'TF', 'DF'] as const)
    .filter((f) => flags[f])
    .join(' ');
}

/** Runs `source` with Run (no refresh until the end) and returns the machine. */
function runProgram(source: string): DataSpace {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(source);
  const interpreter = new Interpreter(dsp, program);
  const never = () => false;
  interpreter.beginRun(never);
  while (interpreter.runSteps(1000, never).kind === 'continue');
  interpreter.endRun();
  return dsp;
}

describe('lazy flags (DataSpace.setFlagsLazy)', () => {
  it('computes a recorded operation on first read', () => {
    const dsp = new DataSpace(64, 0);
    // 8-bit 0x80 + 0x80 = 0x100: carry, overflow, zero, even parity, no AF.
    dsp.setFlagsLazy(1, ALL, 0x80, 0x80, 0x100, 0x80);
    expect(flagString(dsp.flags)).toBe('CF OF ZF PF');
  });

  it('computes AF from the real subtrahend (07 Q-F-1)', () => {
    const dsp = new DataSpace(64, 0);
    // 0x10 - 0x01 borrows out of bit 3; b is the negated subtrahend.
    dsp.setFlagsLazy(1, ALL, 0x10, -0x01, 0x0f, 0x01);
    expect(dsp.fAuxiliary).toBe(true);
    expect(dsp.fCarry).toBe(false);
    dsp.setFlagsLazy(4, ALL, 0x20, -0x10, 0x10, 0x10);
    expect(dsp.fAuxiliary).toBe(false);
  });

  it('keeps flags the next operation does not set (INC keeps CF)', () => {
    const dsp = new DataSpace(64, 0);
    dsp.setFlagsLazy(4, ALL, 0xffffffff, 1, 0x100000000, 1); // CF = 1, still pending
    dsp.setFlagsLazy(4, ALL & ~Flag.CF, 5, 1, 6, 1); // like INC
    expect(dsp.fCarry).toBe(true);
    expect(dsp.fZero).toBe(false);
  });

  it('keeps an explicitly written flag over the recorded operation', () => {
    const dsp = new DataSpace(64, 0);
    dsp.setFlagsLazy(2, ALL, 0xffff, 1, 0x10000, 1);
    dsp.fCarry = false;
    dsp.fZero = false;
    expect(dsp.fCarry).toBe(false);
    expect(dsp.fZero).toBe(false);
    expect(dsp.fParity).toBe(true);
  });

  it('a later operation replaces flags it sets even when they were never read', () => {
    const dsp = new DataSpace(64, 0);
    dsp.setFlagsLazy(4, ALL, 1, -1, 0, 1); // ZF = 1
    dsp.setFlagsLazy(4, Flag.SF | Flag.ZF | Flag.PF, 3, 3, 3, 3); // like AND
    expect(dsp.fZero).toBe(false);
    expect(dsp.fCarry).toBe(false);
  });

  it('materializeFlags computes every pending flag', () => {
    const dsp = new DataSpace(64, 0);
    dsp.setFlagsLazy(1, ALL, 0x7f, 1, 0x80, 1);
    dsp.materializeFlags();
    dsp.setFlagsLazy(1, Flag.ZF, 0, 0, 0, 0);
    expect(flagString(dsp.flags)).toBe('OF SF ZF AF');
  });

  it('setFlags, clear and snapshots replace pending flags', () => {
    const dsp = new DataSpace(64, 0);
    dsp.setFlagsLazy(4, ALL, 0, 0, 0, 0);
    const snapshot = takeSnapshot(dsp);
    expect(flagString(snapshot.flags)).toBe('ZF PF');
    dsp.setFlagsLazy(4, ALL, 0xffffffff, 0xffffffff, 0x1fffffffe, 0xffffffff);
    restoreSnapshot(dsp, snapshot);
    expect(flagString(dsp.flags)).toBe('ZF PF');
    dsp.setFlagsLazy(4, ALL, 0xffffffff, 1, 0x100000000, 1);
    dsp.clear();
    expect(flagString(dsp.flags)).toBe('');
    dsp.setFlagsLazy(4, ALL, 0xffffffff, 1, 0x100000000, 1);
    dsp.setFlags({ ...dsp.flags, CF: false });
    expect(flagString(dsp.flags)).toBe('ZF PF AF');
  });
});

describe('lazy flags in programs', () => {
  it('INC and DEC keep the carry of an earlier ADD', () => {
    const dsp = runProgram('mov eax, 0xFFFFFFFF\nadd eax, 1\ninc ebx\ndec ecx\nsetc dl');
    expect(dsp.registers.get(dsp.DL)).toBe(1);
    expect(dsp.fCarry).toBe(true);
    expect(dsp.fSign).toBe(true); // from DEC ECX (0 - 1)
  });

  it('ADC/SBB chains read the pending carry', () => {
    // 64-bit 0x00000001_FFFFFFFF + 0x00000000_00000001, then subtract it back.
    const dsp = runProgram(
      [
        'mov eax, 0xFFFFFFFF',
        'mov edx, 1',
        'add eax, 1',
        'adc edx, 0',
        'sub eax, 1',
        'sbb edx, 0',
      ].join('\n'),
    );
    expect(dsp.registers.get(dsp.EAX)).toBe(0xffffffff);
    expect(dsp.registers.get(dsp.EDX)).toBe(1);
    expect(dsp.fCarry).toBe(false);
  });

  it('shifts keep AF and set CF/OF over a pending operation', () => {
    const dsp = runProgram('mov al, 0x0F\nadd al, 1\nmov bl, 0x81\nshl bl, 1');
    // AF from ADD (0x0F + 1 carries out of bit 3); CF, OF from SHL; SF, ZF, PF from 0x02.
    expect(flagString(dsp.flags)).toBe('CF OF AF');
  });

  it('PUSHF and LAHF see pending flags', () => {
    const dsp = runProgram(
      'mov al, 0xFF\nadd al, 1\npushf\npop bx\nmov al, 0x7F\ncmp al, 0x80\nlahf',
    );
    expect(dsp.registers.get(dsp.BX)).toBe(0x57); // CF PF AF ZF + bit 1
    expect(dsp.registers.get(dsp.AH)).toBe(0x87); // CF PF SF + bit 1 (0x7F - 0x80 = 0xFF)
  });

  it('POPF and SAHF replace pending flags', () => {
    const dsp = runProgram('mov eax, 0\nadd eax, 0\npush 0x0801\npopf');
    expect(flagString(dsp.flags)).toBe('CF OF');
    const dsp2 = runProgram('mov eax, 0\nadd eax, 0\nmov ah, 0x80\nsahf');
    expect(flagString(dsp2.flags)).toBe('SF');
  });

  it('conditional jumps, SETcc and CMOVcc read pending flags', () => {
    const dsp = runProgram(
      [
        'mov eax, 5',
        'cmp eax, 7',
        'jl less',
        'mov ebx, 99',
        'less:',
        'setb cl',
        'mov edx, 1',
        'cmovle edx, eax',
      ].join('\n'),
    );
    expect(dsp.registers.get(dsp.EBX)).toBe(0);
    expect(dsp.registers.get(dsp.CL)).toBe(1);
    expect(dsp.registers.get(dsp.EDX)).toBe(5);
  });
});

describe('lazy flags during a run', () => {
  class ManualScheduler implements Scheduler {
    time = 0;
    private queue: { at: number; callback: () => void }[] = [];
    setTimeout(callback: () => void, ms: number) {
      const task = { at: this.time + ms, callback };
      this.queue.push(task);
      return task;
    }
    clearTimeout(handle: unknown) {
      this.queue = this.queue.filter((t) => t !== handle);
    }
    now() {
      return this.time;
    }
    /** Runs the next task, advancing the clock by `cost` ms for the work it does. */
    tick(cost: number) {
      const task = this.queue.shift();
      if (!task) return false;
      this.time = Math.max(this.time, task.at) + cost;
      task.callback();
      return true;
    }
  }

  it('a mid-run refresh sees the flags of the instructions executed so far', () => {
    const scheduler = new ManualScheduler();
    // One line per batch, refresh after each batch.
    const session = new MachineSession(undefined, scheduler, {
      batchSteps: 1,
      sliceMs: 0,
      liveRefreshMs: 0,
    });
    session.setText('mov al, 0xFF\nadd al, 1\ninc ebx\njmp 2');
    const seen: string[] = [];
    session.subscribe((e) => {
      if (e.kind === 'refresh') seen.push(flagString(session.dsp.flags));
    });
    session.run();
    for (let i = 0; i < 4; i++) scheduler.tick(1);
    session.pause();
    // After MOV: none; ADD: CF ZF PF AF; INC EBX (keeps CF): CF; JMP: unchanged.
    expect(seen.slice(0, 4)).toEqual(['', 'CF ZF PF AF', 'CF', 'CF']);
  });
});
