import { describe, expect, it } from 'vitest';
import { compileRegion, isSpecialized } from './compiled-run';
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

/** EAX..EBP and the change stamps of their parts (not EIP). */
function generalRegisters(m: Machine): string {
  const { dsp } = m;
  return dsp.registerSets
    .slice(0, 8)
    .map((set) =>
      [set.E, set.X, set.H, set.L]
        .map((a) => (a ? `${dsp.registers.get(a)}:${dsp.isDirty(a, 0)}${dsp.isDirty(a, 1)}` : ''))
        .join(' '),
    )
    .join(', ');
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

  it('keeps registers in V in long regions with many lines that call execute', () => {
    const registers = ['eax', 'ebx', 'edx', 'esi', 'edi', 'ebp'];
    const pairs = (count: number) =>
      Array.from(
        { length: count },
        (_, k) => `add ${registers[k % 6]}, ${k + 1}\nbswap ${registers[(k + 1) % 6]}`,
      ).join('\n');
    const regionSource = (count: number) => {
      const m = machine(`top: ${pairs(count)}\ndec ecx\njnz top`, true);
      const lines = m.program.results;
      return compileRegion(m.dsp, lines, 0, lines.length - 1, () => false).source;
    };
    expect(regionSource(10)).toContain('r0 = V[0] | 0;');
    expect(regionSource(98)).not.toContain('r0 = V[0] | 0;');
    for (const budgets of [[1000], [37, 400]]) {
      compare(`mov ecx, 5\ntop: ${pairs(98)}\ndec ecx\njnz top`, budgets, new Set(), 1000);
    }
  });

  it('specializes the common instructions', () => {
    const source =
      'mov eax, [ebx+4]\nadd eax, 1\njne 0\npush eax\nimul eax, 3\npop bx\nret\nshl eax, 1\n' +
      'sar byte [esi], cl\nrcl ax, 1\nmul dword [ebx]\nidiv cx\nmovzx eax, byte [esi]\n' +
      'movsx edx, cx\nxchg eax, [esi]\nsetg al\ncmovl ecx, [esi]\ncdq\nnop\n' +
      'bswap eax\nbt eax, 3\nimul eax, 4294967295\nxadd eax, ebx';
    const m = machine(source, true);
    const specialized = m.program.results.map((r) => isSpecialized(m.dsp, r));
    expect(specialized).toEqual([...Array<boolean>(19).fill(true), false, false, false, false]);
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

  it('keeps the general registers in locals and writes them back once per exit', () => {
    const m = machine(BUBBLESORT, true);
    const lines = m.program.results;
    const source = compileRegion(m.dsp, lines, 0, lines.length - 1, () => false).source;
    // No register value or stamp is written inline, only on write-back (with `m`).
    expect(source).not.toMatch(/V\[[0-7]\] = (?!r)/);
    expect(source).not.toMatch(/RD\[[0-7]\] = R\.stamp; RM\[[0-7]\] = -?\d/);
    expect(source).toContain('if (m0 !== 0) { V[0] = r0; RD[0] = R.stamp; RM[0] = m0; m0 = 0; }');
    expect(source).toContain('r1 = V[1] | 0;');
  });

  it('writes registers and their stamps back when the budget runs out (Pause)', () => {
    // A tight endless loop over all sizes: every batch stops inside the compiled loop.
    const source = `top: add eax, 3
  mov bl, al
  mov bh, 7
  add cx, 513
  sub edx, eax
  mov si, cx
  lea edi, [eax+ecx*2+1]
  push ebx
  pop ebp
  jmp top`;
    for (const budgets of [[1], [2, 3, 5], [7, 11], [10, 13], [997]]) {
      const { fast, outcomes } = compare(source, budgets, new Set(), 60);
      expect(outcomes.every((o) => o.kind === 'continue')).toBe(true);
      // Entering the loop needs room for its 10 lines.
      if (budgets[0] >= 10) expect(fast.interpreter.runStats.compiled).toBeGreaterThan(0);
    }
    // Exact state after a partial iteration, without comparing to the plain loop.
    const m = machine(source, true);
    const isBreakpoint = () => false;
    m.interpreter.beginRun(isBreakpoint);
    m.interpreter.runSteps(10 * 100 + 2, isBreakpoint);
    expect(m.dsp.getInstructionPointer()).toBe(2);
    expect(reg(m, 'EAX')).toBe(101 * 3);
    expect(reg(m, 'BX')).toBe((7 << 8) | ((101 * 3) % 256));
    expect(reg(m, 'CX')).toBe((100 * 513) % 65536);
    expect(m.dsp.isDirty(m.dsp.getRegisterArgument('BL')!, 0)).toBe(true);
    expect(m.dsp.isDirty(m.dsp.getRegisterArgument('BH')!, 0)).toBe(false);
    expect(m.dsp.isDirty(m.dsp.getRegisterArgument('EBX')!, 0)).toBe(false);
  });

  it('writes registers back on a jump out of the region and at a breakpoint', () => {
    // `far` is not parsed when the loop is compiled, so the jump to it leaves the region.
    const source = `
  mov ecx, 40
top:
  add eax, ecx
  mov dh, cl
  dec ecx
  jnz top
  jmp far
  nop
far:
  mov ebx, eax
  add bl, dh
  mov ecx, 3
  jmp top`;
    for (const budgets of [[1000], [5, 9]]) compare(source, budgets, new Set(), 200);
    // Breakpoints inside, at the end of, and after the compiled loop.
    for (const line of [3, 5, 9, 10]) {
      for (const budgets of [[1000], [4, 17]]) {
        const { outcomes } = compare(source, budgets, new Set([line]), 200);
        expect(outcomes.at(-1)).toEqual({ kind: 'breakpoint', line });
      }
    }
  });

  it('keeps sub-registers and instructions that call execute coherent', () => {
    // IMUL, SHL, XCHG, MOVZX, SETcc, CMOVcc, MUL and DIV read and write registers
    // through DataSpace between lines that keep them in locals.
    const source = `
  mov ecx, 300
  mov esp, 2000
top:
  mov al, cl
  add ah, al
  imul ebx, ecx, 3
  add bx, ax
  shl edx, 1
  xor dl, bh
  xchg al, dh
  movzx esi, dx
  add esi, 1
  setc ch
  cmovs edi, esi
  add di, si
  push ax
  push edi
  pop eax
  pop bp
  mov ebp, eax
  mul bl
  add eax, ebp
  mov ebx, 7
  xor edx, edx
  div ebx
  add edx, eax
  dec cx
  jnz top`;
    for (const budgets of [[1], [3, 7], [1000]]) {
      const { outcomes } = compare(source, budgets, new Set(), 2000);
      expect(outcomes.at(-1)).toEqual({ kind: 'end' });
    }
  });

  it('writes registers back when a memory listener throws mid-region', () => {
    const source = 'top: add eax, 3\nmov bl, al\nmov [ecx*4+100], eax\ninc ecx\njmp top';
    const results = [false, true].map((compiled) => {
      const m = machine(source, compiled);
      m.dsp.memory.addListener(
        (address) => {
          if (address === 300) throw new Error('device fault');
        },
        [{ start: 300, end: 301 }],
      );
      const isBreakpoint = () => false;
      m.interpreter.beginRun(isBreakpoint);
      expect(() => m.interpreter.runSteps(1000, isBreakpoint)).toThrow('device fault');
      return m;
    });
    expect(reg(results[1], 'EAX')).toBe(51 * 3);
    // The run threw from the compiled loop (no statistics: `runSteps` did not return).
    const regions = (results[1].interpreter as unknown as { regions: unknown[] }).regions;
    expect(regions[2]).toBeDefined();
    expect(generalRegisters(results[1])).toBe(generalRegisters(results[0]));
  });

  it('runs shifts, rotates, MUL, IMUL, DIV and extensions as execute does on edge values', () => {
    const edges = [
      0, 1, 2, 7, 0x7f, 0x80, 0xff, 0x100, 0x7fff, 0x8000, 0xffff, 0x10000, 0x12345678, 0x7fffffff,
      0x80000000, 0x80000001, 0xfffffffe, 0xffffffff,
    ];
    const counts = [0, 1, 2, 8, 9, 16, 17, 31, 33, 255];
    // Each iteration loads EAX, EBX (and [3000]) and EDX from the tables, CF from bit
    // 31 of EDX, runs the instruction and adds the registers, [3000] and the flags
    // (PUSHFD) to a checksum in EDI.
    const pairs = edges.flatMap((a, i) =>
      counts.map((c, k) => [
        a,
        (edges[(i + k) % edges.length] & ~0xff) | c,
        edges[(i * 7 + k) % edges.length],
      ]),
    );
    const table = (k: number) =>
      pairs.map((p, i) => `${i === 0 ? 'dd ' : i % 16 === 0 ? '\ndd ' : ', '}${p[k]}`).join('');
    const program = (instruction: string) => `
va: ${table(0)}
vb: ${table(1)}
vd: ${table(2)}
  mov edi, 0
  mov esi, 0
  mov esp, 4000
top:
  mov eax, [esi*4+va]
  mov ebx, [esi*4+vb]
  mov edx, [esi*4+vd]
  mov [3000], ebx
  mov ecx, ebx
  bt edx, 31
  ${instruction}
  pushfd
  pop ebp
  imul edi, edi, 31
  add edi, ebp
  imul edi, edi, 31
  add edi, eax
  imul edi, edi, 31
  add edi, ebx
  imul edi, edi, 31
  add edi, ecx
  imul edi, edi, 31
  add edi, edx
  imul edi, edi, 31
  add edi, [3000]
  inc esi
  cmp esi, ${pairs.length}
  jb top`;
    const forms = [
      ...['shl', 'sal', 'shr', 'sar', 'rol', 'ror', 'rcl', 'rcr'].flatMap((op) =>
        ['al', 'ah', 'ax', 'eax', 'byte [3000]', 'word [3000]', 'dword [3000]'].flatMap((dest) =>
          ['cl', '1', '9', '33'].map((count) => `${op} ${dest}, ${count}`),
        ),
      ),
      ...['mul', 'imul'].flatMap((op) =>
        ['bl', 'bh', 'bx', 'ebx', 'byte [3000]', 'word [3000]', 'dword [3000]'].map(
          (source) => `${op} ${source}`,
        ),
      ),
      // Divisions that do not fail (the error cases have their own test): a nonzero
      // divisor and a dividend below 2^(size * 8 - 1) in magnitude, also negative.
      ...['div', 'idiv', 'idiv-'].flatMap((op) =>
        ['bl', 'bh', 'bx', 'ebx', 'byte [3000]', 'word [3000]', 'dword [3000]'].map((source) => {
          const size = /^e|dword/.test(source) ? 4 : /x$|^word/.test(source) ? 2 : 1;
          const mask = [0, 0x7f, 0x7fff, 0, 0x7fffffff][size];
          const negate = op === 'idiv-' ? `neg ${['', 'ax', 'ax', '', 'eax'][size]}\n  ` : '';
          const extend = op === 'div' ? 'xor edx, edx' : ['', 'nop', 'cwd', '', 'cdq'][size];
          return (
            `and eax, ${mask}\n  or ebx, 0x10101\n  mov [3000], ebx\n  ${negate}${extend}\n  ` +
            `${op.replace('-', '')} ${source}`
          );
        }),
      ),
      // EDX beyond 20 bits: `execute` divides (bigints).
      'mov edx, 0x123456\n  or ebx, 0x40000000\n  div ebx',
      'mov edx, 0x123456\n  and ebx, 0x7fffffff\n  or ebx, 0x40000000\n  idiv ebx',
      'mov edx, -1193046\n  and ebx, 0x7fffffff\n  or ebx, 0x40000000\n  idiv ebx',
      'imul eax, ebx',
      'imul ax, bx',
      'imul eax, [3000]',
      'imul edx, ebx, -70000',
      'imul dx, bx, 300',
      'imul eax, eax, 2147483647',
      'movzx eax, bl',
      'movzx eax, bh',
      'movsx eax, bx',
      'movsx dx, bl',
      'movsx eax, byte [3001]',
      'movzx edx, word [3000]',
      'xchg eax, ebx',
      'xchg al, ah',
      'xchg [3000], bh',
      'xchg ax, word [3000]',
      'setc al',
      'setg byte [3000]',
      'cmovo eax, ebx',
      'cmovnc dx, word [3000]',
      'cbw',
      'cwde',
      'cwd',
      'cdq',
    ];
    for (const [k, form] of forms.entries()) {
      // Every fourth form also stops at other lines (the checksum covers every iteration).
      const budgets = k % 4 === 0 ? [37, 101] : [1000];
      try {
        const { fast, outcomes } = compare(program(form), budgets, new Set(), 100);
        expect(
          fast.interpreter.runStats.compiled,
          describeOutcome(outcomes.at(-1)!),
        ).toBeGreaterThan(pairs.length * 10);
      } catch (error) {
        throw new Error(`${form}, budgets ${budgets.join(' ')}: ${String(error)}`, {
          cause: error,
        });
      }
    }
  }, 600_000);

  it('stops on DIV and IDIV errors with the registers written back (07 Q-I-3)', () => {
    // Registers the loop writes stay in locals until the error returns.
    const loop = (setup: string, division: string) => `
  mov ecx, 20
top:
  add eax, 3
  mov bl, al
  mov ebp, ecx
  ${setup}
  ${division}
  mov edi, eax
  dec ecx
  jnz top`;
    // Each case fails when ECX reaches 6, after 14 iterations.
    const below7 = 'cmp ecx, 7\n  setb dl\n  movzx edx, dl';
    const cases: [string, string, string][] = [
      ['mov esi, ecx\n  sub esi, 6\n  mov edx, 0', 'div esi', 'Division by zero'],
      ['mov esi, ecx\n  sub esi, 6\n  cdq', 'idiv esi', 'Division by zero'],
      [`${below7}\n  mov esi, 1`, 'div esi', 'Division overflow'],
      ['mov si, cx\n  sub si, 6\n  mov dx, 0', 'idiv si', 'Division by zero'],
      ['mov ax, 100\n  mov dh, cl\n  sub dh, 6', 'div dh', 'Division by zero'],
      [
        `mov eax, 7\n  ${below7}\n  mov ah, dl\n  shl ah, 2\n  mov dl, 2`,
        'div dl',
        'Division overflow',
      ],
      [
        `${below7}\n  mov eax, edx\n  ror eax, 1\n  cdq\n  mov esi, -1`,
        'idiv esi',
        'Division overflow',
      ],
      // EDX beyond 20 bits: `execute` divides (bigints), also when it fails.
      [
        'mov edx, 0x123456\n  mov esi, ecx\n  sub esi, 6\n  shl esi, 24',
        'div esi',
        'Division by zero',
      ],
      [
        'mov edx, 0x123456\n  mov esi, ecx\n  sub esi, 5\n  shl esi, 20',
        'div esi',
        'Division overflow',
      ],
    ];
    for (const [setup, division, message] of cases) {
      const source = loop(setup, division);
      const line = source.split('\n').findIndex((l) => l.trim() === division);
      for (const budgets of [[1000], [7, 13]]) {
        const { fast, outcomes } = compare(source, budgets, new Set(), 1000);
        expect(outcomes.at(-1), source).toMatchObject({
          kind: 'error',
          line,
          error: expect.objectContaining({ errorMsg: message }),
        });
        expect(fast.dsp.getInstructionPointer()).toBe(line);
        if (budgets[0] === 1000) {
          expect(fast.interpreter.runStats.compiled).toBeGreaterThan(40);
          expect(isSpecialized(fast.dsp, fast.program.results[line])).toBe(true);
        }
      }
    }
  });

  it('matches the plain loop on random programs (differential fuzzer)', () => {
    // FUZZ_RUNS and FUZZ_BATCHES scale it up (e.g. FUZZ_RUNS=5000 FUZZ_BATCHES=400; hence
    // the long timeout), FUZZ_SEED picks other programs.
    const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process
      ?.env;
    const runs = Number(env?.['FUZZ_RUNS'] ?? 120);
    const batches = Number(env?.['FUZZ_BATCHES'] ?? 40);
    const seed = Number(env?.['FUZZ_SEED'] ?? 1);
    let state = seed >>> 0 || 1;
    const random = (n: number) => {
      // xorshift32
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      return (state >>> 0) % n;
    };
    const pick = <T>(items: readonly T[]) => items[random(items.length)];
    let compiled = 0;
    for (let run = 0; run < runs; run++) {
      const source = randomProgram(random, pick);
      const lines = source.split('\n').length;
      const breakpoints = new Set<number>();
      for (let k = random(4) === 0 ? 1 + random(2) : 0; k > 0; k--) {
        breakpoints.add(random(lines));
      }
      const budgets = [pick([1, 2, 3, 5, 13, 64, 1000]), pick([1, 7, 50, 333])];
      try {
        const { fast } = compare(source, budgets, breakpoints, batches);
        compiled += fast.interpreter.runStats.compiled;
      } catch (error) {
        throw new Error(`seed ${seed}, run ${run}:\n${source}\n${String(error)}`, { cause: error });
      }
    }
    expect(compiled).toBeGreaterThan(runs * 10);
  }, 3_600_000);
});

const R32 = ['EAX', 'EBX', 'ECX', 'EDX', 'ESI', 'EDI', 'EBP'];
const R16 = ['AX', 'BX', 'CX', 'DX', 'SI', 'DI', 'BP'];
const R8 = ['AL', 'AH', 'BL', 'BH', 'CL', 'CH', 'DL', 'DH'];
const SIZE = ['', 'byte', 'word', '', 'dword'];
const CONDITIONS = ['z', 'nz', 'c', 'nc', 's', 'ns', 'l', 'ge', 'le', 'g', 'a', 'be', 'o', 'p'];

/**
 * A random program for the differential fuzzer: mostly instructions Run compiles
 * to specialized code, on registers of every size and memory around EDI (in range
 * until the program moves EDI away), with instructions that call `execute` in
 * between, jumps anywhere (including endless loops) and a subroutine.
 */
function randomProgram(random: (n: number) => number, pick: <T>(items: readonly T[]) => T): string {
  const length = 4 + random(24);
  const labels = 1 + random(4);
  const label = () => `L${random(labels)}`;
  const register = (size: number) => pick(size === 4 ? R32 : size === 2 ? R16 : R8);
  const memory = (size: number) => {
    const offset = random(64) * pick([1, 2, 4]);
    const index = random(3) === 0 ? `+${pick(['ecx', 'esi'])}*${pick([1, 2, 4])}` : '';
    return `${SIZE[size]} [edi${index}+${offset}]`;
  };
  const operand = (size: number, memoryAllowed: boolean) =>
    memoryAllowed && random(3) === 0 ? memory(size) : register(size);
  const immediate = (size: number) =>
    String(size === 4 ? random(140000) - 70000 : random(size === 2 ? 65536 : 256));
  const lines = ['mov edi, 512', 'mov esp, 3000', `mov ecx, ${random(50)}`];
  const placed = new Set<number>();
  for (let k = 0; k < length; k++) {
    if (random(4) === 0) {
      const l = random(labels);
      if (!placed.has(l)) {
        placed.add(l);
        lines.push(`L${l}:`);
      }
    }
    const size = pick([1, 2, 4, 4, 4]);
    const r = random(27);
    if (r < 6) {
      const op = pick(['mov', 'add', 'adc', 'sub', 'sbb', 'cmp', 'and', 'or', 'xor', 'test']);
      const dest = operand(size, true);
      const source = random(3) === 0 ? immediate(size) : operand(size, !dest.includes('['));
      lines.push(`${op} ${dest}, ${source}`);
    } else if (r < 8) {
      lines.push(`${pick(['inc', 'dec', 'neg', 'not'])} ${operand(size, true)}`);
    } else if (r < 9) {
      lines.push(
        `lea ${register(4)}, [${register(4)}+${register(4)}*${pick([1, 2, 4, 8])}+${random(99)}]`,
      );
    } else if (r < 10) {
      const pushSize = pick([2, 4]);
      lines.push(`push ${random(4) === 0 ? random(1000) : register(pushSize)}`);
      lines.push(`pop ${register(pushSize)}`);
    } else if (r < 11) {
      lines.push(`push ${register(4)}`);
    } else if (r < 12) {
      lines.push(`pop ${register(pick([2, 4]))}`);
    } else if (r < 14) {
      lines.push(`j${pick([...CONDITIONS, 'mp'])} ${label()}`);
    } else if (r < 15) {
      lines.push(`${pick(['loop', 'loopne', 'loope', 'jecxz', 'jcxz'])} ${label()}`);
    } else if (r < 16) {
      lines.push('call sub');
    } else if (r < 17) {
      lines.push(`and edi, ${pick([1020, 2044, 508])}`);
    } else if (r < 23) {
      // Shifts, rotates, multiplication, division, extensions, XCHG, SETcc, CMOVcc, ...
      const count = () => (random(3) === 0 ? 'cl' : String(random(random(2) ? 40 : 256)));
      const wide = pick([2, 4]);
      const extendSource = () => (random(3) === 0 ? memory(pick([1, 2])) : register(pick([1, 2])));
      const dividend = pick([
        '',
        '',
        'xor edx, edx\n',
        'cdq\n',
        'cwd\n',
        `mov edx, ${random(9)}\n`,
      ]);
      lines.push(
        pick([
          `${pick(['shl', 'sal', 'shr', 'sar'])} ${operand(size, true)}, ${count()}`,
          `${pick(['shl', 'shr', 'sar'])} ${register(size)}, ${pick(['1', 'cl'])}`,
          `${pick(['rol', 'ror', 'rcl', 'rcr'])} ${operand(size, true)}, ${count()}`,
          `${pick(['rol', 'ror', 'rcl', 'rcr'])} ${register(size)}, ${pick(['1', 'cl', String(size * 8), String(size * 8 + 1)])}`,
          `mul ${operand(size, true)}`,
          `imul ${operand(size, true)}`,
          `imul ${register(wide)}, ${operand(wide, true)}`,
          `imul ${register(wide)}, ${operand(wide, true)}, ${immediate(wide)}`,
          `imul ${register(4)}, ${random(2) ? immediate(4) : pick(['-2147483648', '2147483647', '4294967295'])}`,
          `${dividend}${pick(['div', 'idiv'])} ${operand(size, true)}`,
          `${pick(['movzx', 'movsx'])} ${register(4)}, ${extendSource()}`,
          `${pick(['movzx', 'movsx'])} ${register(2)}, ${random(3) === 0 ? memory(1) : register(1)}`,
          `xchg ${operand(size, true)}, ${register(size)}`,
          `xchg ${register(size)}, ${operand(size, true)}`,
          `xchg ${pick(['[ecx*2+edi]', '[esi+edi]'])}, ${pick(['ecx', 'cx', 'cl', 'esi', 'si'])}`,
          `set${pick(CONDITIONS)} ${operand(1, true)}`,
          `cmov${pick(CONDITIONS)} ${register(wide)}, ${operand(wide, true)}`,
          pick(['cbw', 'cwde', 'cwd', 'cdq', 'nop']),
        ]),
      );
    } else {
      // Instructions that call `execute`.
      lines.push(
        pick([
          `imul ${register(4)}, ${register(4)}, ${random(100)}`,
          `imul ${register(4)}, ${register(4)}`,
          `shl ${register(size)}, ${random(8)}`,
          `sar ${register(size)}, cl`,
          `shr ${operand(size, true)}, 1`,
          `xchg ${register(size)}, ${register(size)}`,
          `movzx ${register(4)}, ${register(pick([1, 2]))}`,
          `movsx ${register(4)}, ${register(pick([1, 2]))}`,
          `set${pick(CONDITIONS)} ${register(1)}`,
          `cmov${pick(CONDITIONS)} ${register(4)}, ${register(4)}`,
          `mul ${register(size)}`,
          `bswap ${register(4)}`,
          `xadd ${register(size)}, ${register(size)}`,
        ]),
      );
    }
  }
  for (let l = 0; l < labels; l++) if (!placed.has(l)) lines.push(`L${l}:`);
  lines.push('jmp L0', 'sub:', `add ${register(4)}, ${random(9)}`);
  lines.push(`mov ${register(1)}, ${register(1)}`, 'ret');
  return lines.join('\n');
}
