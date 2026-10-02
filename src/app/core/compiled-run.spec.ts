import { describe, expect, it } from 'vitest';
import { isSpecialized } from './compiled-run';
import { DataSpace } from './data-space';
import { Interpreter, RunOutcome } from './interpreter';
import { MemoryRange } from './memory';
import { Program } from './program';
import { serializeSnapshot, takeSnapshot } from './snapshot';

interface Machine {
  dsp: DataSpace;
  program: Program;
  interpreter: Interpreter;
  writes: string[];
}

/** A machine whose memory listener records the writes inside `ranges` (all if omitted). */
function machine(
  source: string,
  compiled: boolean,
  memory = 4096,
  offset = 0,
  ranges?: readonly MemoryRange[],
): Machine {
  const dsp = new DataSpace(memory, offset);
  const program = new Program(dsp);
  program.setText(source);
  const interpreter = new Interpreter(dsp, program);
  interpreter.useCompiledCode = compiled;
  const writes: string[] = [];
  dsp.memory.addListener((address, value) => writes.push(`${address}=${value}`), ranges);
  return { dsp, program, interpreter, writes };
}

/** Everything a panel or a later Step can observe, including the change stamps. */
function observable(m: Machine): string {
  const { dsp } = m;
  const registers = dsp.registerSets.flatMap((set) =>
    [set.L, set.H, set.X, set.E].map((a) => (a ? `${dsp.isDirty(a, 0)}${dsp.isDirty(a, 1)}` : '')),
  );
  const memory: number[] = [];
  for (let a = dsp.offset; a < dsp.memoryEnd; a++) {
    if (dsp.memory.isDirty(a, 0)) memory.push(a);
  }
  return JSON.stringify({
    snapshot: serializeSnapshot(takeSnapshot(dsp)),
    registers,
    memory,
    writes: m.writes,
    outOfRange: dsp.addressOutOfRange(),
  });
}

const describeOutcome = (o: RunOutcome) =>
  JSON.stringify(o.kind === 'error' ? { ...o, error: o.error.errorMsg } : o);

/**
 * Runs `source` with and without compiled code in batches of `budgets` (cycled)
 * and expects the same outcome and state after every batch. Returns the compiled
 * machine and its outcomes.
 */
function compare(
  source: string,
  budgets: readonly number[],
  breakpoints: ReadonlySet<number> = new Set(),
  maxBatches = 200,
  ranges?: readonly MemoryRange[],
) {
  const plain = machine(source, false, 4096, 0, ranges);
  const fast = machine(source, true, 4096, 0, ranges);
  const isBreakpoint = (line: number) => breakpoints.has(line);
  const outcomes: RunOutcome[] = [];
  plain.interpreter.beginRun(isBreakpoint);
  fast.interpreter.beginRun(isBreakpoint);
  for (let k = 0; k < maxBatches; k++) {
    const budget = budgets[k % budgets.length];
    const o1 = plain.interpreter.runSteps(budget, isBreakpoint);
    const o2 = fast.interpreter.runSteps(budget, isBreakpoint);
    expect(describeOutcome(o2)).toBe(describeOutcome(o1));
    expect(observable(fast)).toBe(observable(plain));
    outcomes.push(o2);
    if (o1.kind !== 'continue' && o1.kind !== 'sleep') break;
  }
  plain.interpreter.endRun();
  fast.interpreter.endRun();
  expect(observable(fast)).toBe(observable(plain));
  return { fast, plain, outcomes };
}

const reg = (m: Machine, name: string) => m.dsp.registers.get(m.dsp.getRegisterArgument(name)!);

const BUBBLESORT = `
  mov ecx, 0
fill:
  mov eax, ecx
  imul eax, eax, 1103515245
  add eax, 12345
  mov [ecx*4], eax
  inc ecx
  cmp ecx, 20
  jl fill
  mov esi, 19
outer:
  cmp esi, 0
  jle sorted
  mov ecx, 0
inner:
  mov eax, [ecx*4]
  mov ebx, [ecx*4+4]
  cmp eax, ebx
  jbe noswap
  mov [ecx*4], ebx
  mov [ecx*4+4], eax
noswap:
  inc ecx
  cmp ecx, esi
  jl inner
  dec esi
  jmp outer
sorted:
  mov eax, 1`;

const MIXED = `
v: dd 5, 6, 7
c: equ 3
  mov esi, v
  mov ecx, 10
again:
  mov ax, [esi]
  add al, ah
  adc bx, ax
  sbb dl, 7
  neg dh
  not word [esi+4]
  xor ebp, ecx
  or bl, 128
  test ebp, 3
  sete ah
  shl eax, 3
  sar ebx, 1
  push eax
  pop edx
  lea edi, [esi+ecx*4+8]
  add edi, c
  call sub
  loopne again
  mov eax, again
  mov [esi+8], again
  mov ebx, [esi+8]
  jmp done
sub:
  sub edx, 1
  cmovl eax, edx
  ret
done:
  nop`;

/** Pushes, calls and stores around a stack at 64, without label markers. */
const STACK = `
  mov esp, 64
  mov ecx, 30
again:
  push ecx
  push cx
  pop dx
  call sub
  pop eax
  mov [ecx*2], ax
  loop again
  jmp done
sub:
  add ebx, eax
  ret
done:
  nop`;

describe('compiled Run (spec 04 §9.3 port note)', () => {
  it('runs loops as compiled code with the same results and stamps', () => {
    for (const budgets of [[1], [3, 7], [13, 1, 50]])
      compare(BUBBLESORT, budgets, new Set(), 10000);
    const { fast } = compare(BUBBLESORT, [1000]);
    const { compiled, interpreted } = fast.interpreter.runStats;
    expect(compiled / (compiled + interpreted)).toBeGreaterThan(0.9);
  });

  it('matches the plain loop for mixed sizes, calls, label markers and fallbacks', () => {
    for (const budgets of [[1], [2, 5], [1000]]) {
      const { outcomes, fast } = compare(MIXED, budgets, new Set(), 1000);
      expect(outcomes.at(-1)).toEqual({ kind: 'end' });
      expect(reg(fast, 'EBX')).toBe(5);
    }
  });

  it('splits long programs into several regions', () => {
    const body = Array.from({ length: 450 }, (_, k) => `add eax, ${k}\nxor ebx, eax`).join('\n');
    const source = `mov ecx, 30\ntop: ${body}\ndec ecx\njnz top`;
    for (const budgets of [[1000], [37, 400]]) {
      const { fast, outcomes } = compare(source, budgets, new Set(), 1000);
      expect(outcomes.at(-1)).toEqual({ kind: 'end' });
      expect(fast.interpreter.runStats.regions).toBeGreaterThan(4);
    }
  });

  it('specializes the common instructions', () => {
    const source =
      'mov eax, [ebx+4]\nadd eax, 1\njne 0\npush eax\nimul eax, 3\npop bx\nret\nshl eax, 1';
    const m = machine(source, true);
    const specialized = m.program.results.map((r) => isSpecialized(m.dsp, r));
    expect(specialized).toEqual([true, true, true, true, false, true, true, false]);
  });

  it('never executes more lines than the budget, also in a tight loop', () => {
    const m = machine('top: inc eax\njmp top', true);
    const isBreakpoint = () => false;
    m.interpreter.beginRun(isBreakpoint);
    let lines = 0;
    for (const budget of [1, 2, 3, 5, 8, 1000, 999, 1]) {
      expect(m.interpreter.runSteps(budget, isBreakpoint).kind).toBe('continue');
      lines += budget;
      // Every second line is the INC.
      expect(reg(m, 'EAX')).toBe(Math.floor((lines + 1) / 2));
      expect(m.dsp.getInstructionPointer()).toBe(lines % 2);
    }
    expect(m.interpreter.runStats.compiled).toBeGreaterThan(1900);
  });

  it('stops at breakpoints inside compiled loops, but not on the one it starts on', () => {
    const source = 'mov ecx, 5\ntop: inc eax\ndec ecx\njnz top\nmov ebx, 1';
    const { outcomes } = compare(source, [1000], new Set([2]));
    expect(outcomes.at(-1)).toEqual({ kind: 'breakpoint', line: 2 });
    // Starting on the breakpoint line runs it once, then stops there again.
    const m = machine(source, true);
    const breakpoints = new Set([2]);
    const isBreakpoint = (line: number) => breakpoints.has(line);
    m.interpreter.beginRun(isBreakpoint);
    m.interpreter.runSteps(1000, isBreakpoint);
    for (let round = 0; round < 5; round++) {
      m.interpreter.endRun();
      m.interpreter.beginRun(isBreakpoint);
      const outcome = m.interpreter.runSteps(1000, isBreakpoint);
      expect(outcome.kind).toBe(round < 4 ? 'breakpoint' : 'end');
    }
    expect(reg(m, 'ECX')).toBe(0);
  });

  it('stops at a breakpoint set during the run', () => {
    const m = machine('top: inc eax\nadd ebx, 2\njmp top', true);
    const breakpoints = new Set<number>();
    const isBreakpoint = (line: number) => breakpoints.has(line);
    m.interpreter.beginRun(isBreakpoint);
    // Whole iterations: the next batch enters the compiled loop at its first line.
    expect(m.interpreter.runSteps(99, isBreakpoint).kind).toBe('continue');
    expect(m.dsp.getInstructionPointer()).toBe(0);
    breakpoints.add(1);
    m.interpreter.breakpointsChanged();
    expect(m.interpreter.runSteps(99, isBreakpoint)).toEqual({ kind: 'breakpoint', line: 1 });
    expect(reg(m, 'EAX')).toBe(reg(m, 'EBX') / 2 + 1);
  });

  it('leaves EIP on a failing line (07 Q-E-1), with the state of the plain loop', () => {
    const outOfRange = 'mov ebx, 4000\ntop: add ebx, 32\nmov eax, [ebx]\njmp top';
    const { outcomes, fast } = compare(outOfRange, [7]);
    expect(outcomes.at(-1)).toMatchObject({ kind: 'error', line: 2 });
    expect(fast.dsp.getInstructionPointer()).toBe(2);
    const division = 'mov ecx, 3\ntop: dec ecx\nmov eax, 10\ndiv ecx\njmp top';
    expect(compare(division, [1000]).outcomes.at(-1)).toMatchObject({
      kind: 'error',
      line: 3,
      error: expect.objectContaining({ errorMsg: 'Division by zero' }),
    });
    const underflow = 'top: inc eax\nret';
    expect(compare(underflow, [1000]).outcomes.at(-1)).toMatchObject({ kind: 'error', line: 1 });
  });

  it('returns for JASMINSLEEP with EIP after it', () => {
    const { outcomes, fast } = compare(
      'top: inc eax\njasminsleep 5\njmp top',
      [1000],
      new Set(),
      4,
    );
    expect(outcomes).toEqual([
      { kind: 'sleep', ms: 5 },
      { kind: 'sleep', ms: 5 },
      { kind: 'sleep', ms: 5 },
      { kind: 'sleep', ms: 5 },
    ]);
    expect(fast.dsp.getInstructionPointer()).toBe(2);
  });

  it('computes addresses on every execution and notifies memory listeners (07 Q-I-18)', () => {
    const { fast } = compare('mov ecx, 8\ntop: mov [ecx*4+100], cl\nloop top', [3]);
    expect(fast.writes).toEqual([8, 7, 6, 5, 4, 3, 2, 1].map((v) => `${v * 4 + 100}=${v}`));
  });

  it('works with a memory offset', () => {
    const source = 'mov esi, 5000\ntop: add dword [esi], 3\nadd esi, 4\ncmp esi, 5040\njb top';
    const plain = machine(source, false, 4096, 4096);
    const fast = machine(source, true, 4096, 4096);
    for (const m of [plain, fast]) {
      m.interpreter.beginRun(() => false);
      while (m.interpreter.runSteps(5, () => false).kind === 'continue');
      m.interpreter.endRun();
    }
    expect(observable(fast)).toBe(observable(plain));
    expect(fast.dsp.getUnsignedMemory(5036, 4)).toBe(3n);
  });

  it('runs fast outside watched ranges and notifies writes inside them', () => {
    const ranges = [
      { start: 10, end: 13 },
      { start: 56, end: 58 },
    ];
    const inRanges = (write: string) => {
      const address = Number(write.split('=')[0]);
      return ranges.some((r) => address >= r.start && address < r.end);
    };
    // Every write and stamp as with a listener for all addresses, only the inner ones reported.
    const all = compare(BUBBLESORT, [1000], new Set(), 10000);
    for (const budgets of [[1], [3, 7], [1000]]) {
      const { fast, outcomes } = compare(BUBBLESORT, budgets, new Set(), 10000, ranges);
      expect(outcomes.at(-1)?.kind).toBe('end');
      expect(fast.writes).toEqual(all.fast.writes.filter(inRanges));
      expect(fast.writes.length).toBeGreaterThan(0);
    }
    const allStack = compare(STACK, [1000], new Set(), 1000);
    for (const budgets of [[1], [2, 5], [1000]]) {
      const { fast, outcomes } = compare(STACK, budgets, new Set(), 1000, ranges);
      expect(outcomes.at(-1)).toEqual({ kind: 'end' });
      expect(fast.writes).toEqual(allStack.fast.writes.filter(inRanges));
      expect(fast.writes.some((w) => w.startsWith('56='))).toBe(true);
    }
    const { fast } = compare(STACK, [1000], new Set(), 1000, ranges);
    const { compiled, interpreted } = fast.interpreter.runStats;
    expect(compiled / (compiled + interpreted)).toBeGreaterThan(0.5);
  });
});
