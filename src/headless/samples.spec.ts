import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DataSpace,
  Interpreter,
  Program,
  machineStateOf,
  serializeSnapshot,
  takeSnapshot,
  type MachineState,
} from '../app/core';
import { ALGORITHM_SAMPLES, SAMPLES } from '../app/samples';

const samples = join(__dirname, '../../public/samples');
const programs = join(__dirname, '../../spec/conformance/programs');

/** Runs a sample to its end on a fresh 4096-byte machine and returns the final state. */
function run(file: string, edit: (source: string) => string = (s) => s): MachineState {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(edit(readFileSync(join(samples, file), 'utf8')));
  program.results.forEach((result, line) => expect(result.error, `line ${line}`).toBeFalsy());
  const interpreter = new Interpreter(dsp, program);
  let steps = 0;
  while (!interpreter.atEnd) {
    expect(++steps).toBeLessThan(100000);
    expect(interpreter.step().error).toBeFalsy();
  }
  return machineStateOf(dsp);
}

/**
 * Runs a device sample with Run until it has asked to sleep (`JASMINSLEEP`) `sleeps`
 * times, without waiting, and returns the state at that point.
 */
function runUntilSleeps(file: string, sleeps: number): MachineState {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(readFileSync(join(samples, file), 'utf8'));
  program.results.forEach((result, line) => expect(result.error, `line ${line}`).toBeFalsy());
  const interpreter = new Interpreter(dsp, program);
  interpreter.beginRun(() => false);
  for (let batches = 0; sleeps > 0; batches++) {
    if (batches > 100_000) throw new Error('too many steps');
    const outcome = interpreter.runSteps(1000, () => false);
    if (outcome.kind === 'sleep') sleeps--;
    else if (outcome.kind !== 'continue') throw new Error(`run ended: ${outcome.kind}`);
  }
  interpreter.endRun();
  return machineStateOf(dsp);
}

function bytes(state: MachineState, address: number, count: number): number[] {
  return [...state.memory.slice(address, address + count)];
}

function dwords(state: MachineState, address: number, count: number): number[] {
  const view = new DataView(state.memory.buffer, state.memory.byteOffset);
  return Array.from({ length: count }, (_, i) => view.getInt32(address + 4 * i, true));
}

/** The numbers a sorting sample starts with: the `dd` lines between `data:` and `data_end:`. */
function data(file: string): number[] {
  const source = readFileSync(join(samples, file), 'utf8');
  const block = source.slice(source.indexOf('data:'), source.indexOf('data_end:'));
  return [...block.matchAll(/^dd (.*)$/gm)].flatMap((m) => m[1].split(',').map(Number));
}

describe('samples', () => {
  it('lists every file in public/samples', () => {
    expect(SAMPLES.map((s) => s.file).sort()).toEqual(
      readdirSync(samples)
        .filter((f) => f.endsWith('.asm'))
        .sort(),
    );
  });

  it.each(ALGORITHM_SAMPLES.map((s) => s.file))('%s is also a conformance program', (file) => {
    const copy = readdirSync(programs).find((f) => f.endsWith(`-sample-${file}`));
    expect(copy).toBeDefined();
    expect(readFileSync(join(programs, copy!), 'utf8')).toBe(
      readFileSync(join(samples, file), 'utf8'),
    );
  });

  it.each(['bubblesort.asm', 'mergesort.asm', 'quicksort.asm'])('%s sorts its data', (file) => {
    const input = data(file);
    expect(input.length).toBeGreaterThan(20);
    const sorted = [...input].sort((a, b) => a - b);
    expect(dwords(run(file), 0, input.length)).toEqual(sorted);
  });

  it('ackermann computes A(3, 3) = 61', () => {
    expect(run('ackermann.asm').registers.EBX).toBe(61);
  });

  it('fibonacci computes fib(15) = 610', () => {
    expect(run('fibonacci.asm').registers.EDX).toBe(610);
  });

  it('primes factors 1234567890', () => {
    expect(dwords(run('primes.asm'), 0, 7)).toEqual([2, 3, 3, 5, 3607, 3803, 0]);
  });

  it('sqrt computes the square root of 0xFFFFFFFF', () => {
    expect(run('sqrt.asm').registers.EAX).toBe(65535);
  });

  it.each([
    0, 1, 2, 3, 4, 8, 9, 10, 99, 100, 101, 65535, 65536, 2147395599, 2147395600, 4294836224,
  ])('sqrt rounds the square root of %i down', (n) => {
    const state = run('sqrt.asm', (s) => s.replace('mov eax, -1', `mov eax, ${n}`));
    expect(state.registers.EAX).toBe(Math.floor(Math.sqrt(n)));
  });

  it('counter shows 1234 after 1235 updates, and wraps from 9999 to 0000', () => {
    // Byte i drives digit i from the right; 4 = 0x66, 3 = 0x4F, 2 = 0x5B, 1 = 0x06.
    expect(bytes(runUntilSleeps('counter.asm', 1235), 0, 4)).toEqual([0x66, 0x4f, 0x5b, 0x06]);
    expect(bytes(runUntilSleeps('counter.asm', 10000), 0, 4)).toEqual([0x6f, 0x6f, 0x6f, 0x6f]);
    expect(bytes(runUntilSleeps('counter.asm', 10001), 0, 4)).toEqual([0x3f, 0x3f, 0x3f, 0x3f]);
  });

  it('running-light rotates the lamps left', () => {
    expect(bytes(runUntilSleeps('running-light.asm', 1), 0, 2)).toEqual([0x07, 0x00]);
    expect(bytes(runUntilSleeps('running-light.asm', 15), 0, 2)).toEqual([0x01, 0xc0]);
    expect(bytes(runUntilSleeps('running-light.asm', 16), 0, 2)).toEqual([0x03, 0x80]);
  });

  it('fizzbuzz prints 1 to 100', () => {
    const expected = Array.from({ length: 100 }, (_, i) => {
      const n = i + 1;
      return (n % 3 ? '' : 'Fizz') + (n % 5 ? '' : 'Buzz') || String(n);
    }).join('\n');
    const state = run('fizzbuzz.asm');
    const text = new TextDecoder().decode(state.memory.slice(0, state.memory.indexOf(0)));
    expect(text).toBe(expected + '\n');
  });

  it('life moves the glider one cell diagonally every 4 generations', () => {
    const rows = (state: MachineState) =>
      Array.from({ length: 16 }, (_, y) => state.memory[2 * y] | (state.memory[2 * y + 1] << 8));
    const start = [0x2, 0x4, 0x7, ...Array<number>(13).fill(0)];
    expect(rows(runUntilSleeps('life.asm', 4))).toEqual(
      [0, ...start.slice(0, 15)].map((r) => r << 1),
    );
    expect(rows(runUntilSleeps('life.asm', 64))).toEqual(start);
  });
});

/** Everything Run leaves behind: the snapshot and which register parts are marked changed. */
function runState(dsp: DataSpace): string {
  const stamps = dsp.registerSets.flatMap((set) =>
    [set.L, set.H, set.X, set.E].map((a) => (a ? `${dsp.isDirty(a, 0)}${dsp.isDirty(a, 1)}` : '')),
  );
  return JSON.stringify({ snapshot: serializeSnapshot(takeSnapshot(dsp)), stamps });
}

describe('compiled Run (spec 04 §9.3 port note)', () => {
  const files = [
    ...readdirSync(programs).map((f) => join(programs, f)),
    ...readdirSync(samples).map((f) => join(samples, f)),
  ].filter((f) => f.endsWith('.asm'));

  it.each(files)('runs %s as the plain loop does', (file) => {
    const source = readFileSync(file, 'utf8');
    for (const budget of [1000, 7]) {
      const machines = [false, true].map((compiled) => {
        const dsp = new DataSpace(4096, 0);
        const program = new Program(dsp);
        program.setText(source);
        const interpreter = new Interpreter(dsp, program);
        interpreter.useCompiledCode = compiled;
        interpreter.beginRun(() => false);
        return { dsp, interpreter };
      });
      for (let batch = 0; batch < 300; batch++) {
        const [plain, fast] = machines.map(({ interpreter }) => {
          const outcome = interpreter.runSteps(budget, () => false);
          return outcome.kind === 'error' ? { ...outcome, error: outcome.error.errorMsg } : outcome;
        });
        expect(fast).toEqual(plain);
        expect(runState(machines[1].dsp)).toBe(runState(machines[0].dsp));
        if (plain.kind !== 'continue' && plain.kind !== 'sleep') break;
      }
    }
  });
});
