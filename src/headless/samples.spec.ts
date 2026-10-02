import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DataSpace, Interpreter, Program, machineStateOf, type MachineState } from '../app/core';
import { SAMPLES } from '../app/samples';

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

function dwords(state: MachineState, address: number, count: number): number[] {
  const view = new DataView(state.memory.buffer, state.memory.byteOffset);
  return Array.from({ length: count }, (_, i) => view.getInt32(address + 4 * i, true));
}

/** The numbers a sorting sample starts with: the `dd` lines between `daten:` and `datenende:`. */
function data(file: string): number[] {
  const source = readFileSync(join(samples, file), 'utf8');
  const block = source.slice(source.indexOf('daten:'), source.indexOf('datenende:'));
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

  it.each(SAMPLES.map((s) => s.file))('%s is also a conformance program', (file) => {
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

  it('prim factors 1234567890', () => {
    expect(dwords(run('prim.asm'), 0, 7)).toEqual([2, 3, 3, 5, 3607, 3803, 0]);
  });

  it('wurzel computes the square root of 0xFFFFFFFF', () => {
    expect(run('wurzel.asm').registers.EAX).toBe(65535);
  });

  it.each([
    0, 1, 2, 3, 4, 8, 9, 10, 99, 100, 101, 65535, 65536, 2147395599, 2147395600, 4294836224,
  ])('wurzel rounds the square root of %i down', (n) => {
    const state = run('wurzel.asm', (s) => s.replace('mov eax, -1', `mov eax, ${n}`));
    expect(state.registers.EAX).toBe(Math.floor(Math.sqrt(n)));
  });
});
