import { describe, expect, it } from 'vitest';
import { runHeadless } from '../headless';

/** Runs `lines` and returns the FPU stack as `ST0..ST7` -> printed value. */
function run(...lines: string[]) {
  const out = runHeadless(lines.join('\n'));
  const fpuLine = out[out.length - 1];
  const st: Record<string, string> = {};
  for (const m of fpuLine.matchAll(/(ST\d)=(\S+)/g)) st[m[1]] = m[2];
  const memLine = out.find((l) => l.startsWith('MEM')) ?? '';
  const mem: Record<string, string> = {};
  for (const m of memLine.matchAll(/([0-9A-F]{4}):([0-9A-F]{2})/g)) mem[m[1]] = m[2];
  const errors = out.filter((l) => l.startsWith('ERROR') || l.startsWith('PARSE'));
  return { out, st, mem, errors };
}

/** Little-endian bytes at `addr` (only the non-zero ones are dumped). */
function bytes(mem: Record<string, string>, addr: number, n: number): string {
  let s = '';
  for (let i = n - 1; i >= 0; i--) {
    s += mem[(addr + i).toString(16).toUpperCase().padStart(4, '0')] ?? '00';
  }
  return s;
}

describe('FLD / FST / FSTP', () => {
  it('loads m64, m32 and ST(i)', () => {
    const { st, errors } = run(
      'a: dq 1.5',
      'b: dd 2.25',
      'fld qword [a]',
      'fld dword [b]',
      'fld st1',
    );
    expect(errors).toEqual([]);
    expect([st['ST0'], st['ST1'], st['ST2']]).toEqual(['1.5', '2.25', '1.5']);
  });

  it('stores to m64, m32 and ST(i), FSTP pops', () => {
    const { st, mem } = run(
      'a: dq 1.5',
      'fld qword [a]',
      'fld1',
      'fst qword [32]',
      'fst dword [40]',
      'fstp st1',
    );
    expect(bytes(mem, 32, 8)).toBe('3FF0000000000000');
    expect(bytes(mem, 40, 4)).toBe('3F800000');
    expect(st['ST0']).toBe('1.0');
  });

  it('rejects immediates and undecided memory', () => {
    expect(run('fld 1.5').errors.length).toBeGreaterThan(0);
    expect(run('x: dq 1.0', 'fld [x]').errors[0]).toContain(
      'Operand must be a 32bit or 64bit memory location, or an FPU register.',
    );
  });
});

describe('FLD constants', () => {
  it('pushes FLD1, FLDZ, FLDPI, FLDL2E, FLDL2T, FLDLG2, FLDLN2', () => {
    const { st } = run('fld1', 'fldz', 'fldpi', 'fldl2e', 'fldl2t', 'fldlg2', 'fldln2');
    expect(st['ST6']).toBe('1.0');
    expect(st['ST5']).toBe('0.0');
    expect(st['ST4']).toBe('3.141592653589793');
    expect(st['ST3']).toBe('1.4426950408889634');
    expect(st['ST2']).toBe('3.3219280948873626');
    expect(st['ST1']).toBe('0.3010299956639812');
    expect(st['ST0']).toBe('0.6931471805599453');
  });
});

describe('FILD / FIST / FISTP', () => {
  it('loads m16, m32 and m64 integers', () => {
    const { st } = run(
      'w: dw 3',
      'd: dd -7',
      'q: dd 0x4876E800, 0x17',
      'fild word [w]',
      'fild dword [d]',
      'fild qword [q]',
    );
    expect([st['ST0'], st['ST1'], st['ST2']]).toEqual(['1.0E11', '-7.0', '3.0']);
  });

  it('stores truncated toward zero; FISTP pops', () => {
    const { st, mem } = run(
      'x: dq -2.5',
      'fld qword [x]',
      'fist dword [16]',
      'fld1',
      'fistp word [20]',
    );
    expect(bytes(mem, 16, 4)).toBe('FFFFFFFE');
    expect(bytes(mem, 20, 2)).toBe('0001');
    expect(st['ST0']).toBe('-2.5');
  });

  it('FIST takes no 64-bit operand', () => {
    expect(run('x: dd 1', 'fist qword [x]').errors.length).toBeGreaterThan(0);
  });
});

describe('FADD family', () => {
  const pre = ['a: dq 10.0', 'b: dq 4.0', 'fld qword [a]', 'fld qword [b]'];
  // ST0 = 4, ST1 = 10
  it.each([
    ['fadd st0, st1', '14.0', '10.0'],
    ['fsub st0, st1', '-6.0', '10.0'],
    ['fsubr st0, st1', '6.0', '10.0'],
    ['fmul st0, st1', '40.0', '10.0'],
    ['fdiv st0, st1', '0.4', '10.0'],
    ['fdivr st0, st1', '2.5', '10.0'],
    ['fadd st1, st0', '4.0', '14.0'],
    ['fsub st1, st0', '4.0', '6.0'],
    ['fsubr st1, st0', '4.0', '-6.0'],
    ['fdiv st1, st0', '4.0', '2.5'],
    ['fdivr st1, st0', '4.0', '0.4'],
    ['fadd st1', '14.0', '10.0'],
    ['fsub st1', '-6.0', '10.0'],
    ['fadd to st1', '4.0', '14.0'],
    ['fsub to st1', '4.0', '6.0'],
    ['fsubr to st1', '4.0', '-6.0'],
    ['fmul to st1', '4.0', '40.0'],
    ['fdiv to st1', '4.0', '2.5'],
    ['fdivr to st1', '4.0', '0.4'],
    ['fadd qword [b]', '8.0', '10.0'],
    ['fsubr qword [a]', '6.0', '10.0'],
    ['fdiv qword [b]', '1.0', '10.0'],
  ])('%s', (line, st0, st1) => {
    const { st, errors } = run(...pre, line);
    expect(errors).toEqual([]);
    expect([st['ST0'], st['ST1']]).toEqual([st0, st1]);
  });

  it('reads m32 operands as float', () => {
    expect(run('c: dd 3.0', 'fld1', 'fdivr dword [c]').st['ST0']).toBe('3.0');
  });

  it('requires ST0 among two register operands', () => {
    expect(run('fadd st1, st2').errors[0]).toContain('One of the arguments must be ST0');
  });

  it('rejects a bare FADD and a third operand', () => {
    expect(run('fadd').errors.length).toBeGreaterThan(0);
    expect(run('fadd st0, st1, st2').errors[0]).toContain('Operand must be empty.');
  });
});

describe('FADDP family (popping)', () => {
  const pre = ['a: dq 10.0', 'b: dq 4.0', 'fld qword [a]', 'fld qword [b]'];
  // ST0 = 4, ST1 = 10; result in ST1, then pop
  it.each([
    ['faddp', '14.0'],
    ['fsubp', '6.0'],
    ['fsubrp', '-6.0'],
    ['fmulp', '40.0'],
    ['fdivp', '2.5'],
    ['fdivrp', '0.4'],
    ['faddp st1', '14.0'],
    ['fsubp st1, st0', '6.0'],
  ])('%s', (line, st0) => {
    const { st, errors } = run(...pre, line);
    expect(errors).toEqual([]);
    expect(st['ST0']).toBe(st0);
    expect(st['ST7']).toBe('4.0'); // popped register keeps its value
  });

  it('accepts any second register like the original (FPUST0 overlaps FPUREG)', () => {
    // ST2 := ST2 - ST1, then pop (verified against the Java original).
    const { st, errors } = run(
      'a: dq 10.0',
      'b: dq 4.0',
      'fld1',
      'fld qword [a]',
      'fld qword [b]',
      'fsubp st2, st1',
    );
    expect(errors).toEqual([]);
    expect([st['ST0'], st['ST1']]).toEqual(['10.0', '-9.0']);
  });

  it('rejects memory operands', () => {
    expect(run('a: dq 1.0', 'faddp qword [a]').errors.length).toBeGreaterThan(0);
  });
});

describe('FIADD family', () => {
  const pre = ['d: dd 5', 'w: dw -2', 'x: dq 10.0', 'fld qword [x]'];
  it.each([
    ['fiadd dword [d]', '15.0'],
    ['fisub dword [d]', '5.0'],
    ['fisubr dword [d]', '-5.0'],
    ['fimul word [w]', '-20.0'],
    ['fidiv word [w]', '-5.0'],
    ['fidivr dword [d]', '0.5'],
  ])('%s', (line, st0) => {
    const { st, errors } = run(...pre, line);
    expect(errors).toEqual([]);
    expect(st['ST0']).toBe(st0);
  });
});

describe('FABS / FCHS / FSIN / FCOS / FSINCOS / FSQRT', () => {
  it('FABS and FCHS', () => {
    expect(run('fld1', 'fchs').st['ST0']).toBe('-1.0');
    expect(run('fld1', 'fchs', 'fabs').st['ST0']).toBe('1.0');
    expect(run('fldz', 'fchs').st['ST0']).toBe('-0.0');
  });

  it('FSIN, FCOS, FSQRT', () => {
    expect(run('fldpi', 'fsin').st['ST0']).toBe('1.2246467991473532E-16');
    expect(run('fldpi', 'fcos').st['ST0']).toBe('-1.0');
    expect(run('x: dq 2.0', 'fld qword [x]', 'fsqrt').st['ST0']).toBe('1.4142135623730951');
    expect(run('fld1', 'fchs', 'fsqrt').st['ST0']).toBe('NaN');
  });

  it('FSINCOS leaves sin in ST1 and cos in ST0', () => {
    const { st } = run('fldpi', 'fsincos');
    expect([st['ST0'], st['ST1']]).toEqual(['-1.0', '1.2246467991473532E-16']);
  });
});

describe('stack wrap-around (07 Q-FPU-1)', () => {
  it('fld1 / fadd st0, st1 reads R0 instead of failing', () => {
    const { st, errors, out } = run('fld1', 'fadd st0, st1');
    expect(errors).toEqual([]);
    expect(out.some((l) => l.startsWith('EXCEPTION'))).toBe(false);
    expect(st['ST0']).toBe('1.0');
  });

  it('nine pushes wrap around', () => {
    const lines = Array<string>(9).fill('fld1');
    const { st } = run(...lines, 'faddp', 'faddp');
    expect(st['ST0']).toBe('3.0');
  });

  it('division by zero gives infinities, no error', () => {
    const { st, errors } = run('fldz', 'fld1', 'fdiv st0, st1');
    expect(errors).toEqual([]);
    expect(st['ST0']).toBe('Infinity');
  });
});
