import { describe, expect, it } from 'vitest';
import { DataSpace } from '../data-space';
import { Interpreter } from '../interpreter';
import { Program } from '../program';

interface Run {
  dsp: DataSpace;
  program: Program;
  errors: string[];
  steps: number;
}

/** Runs `source` to the end (or the first runtime error) on a fresh 4096-byte machine. */
function run(source: string, maxSteps = 1000): Run {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(source);
  const errors: string[] = [];
  program.results.forEach((r, line) => {
    if (r.error) errors.push(`PARSE ${line}: ${r.error.errorMsg}`);
  });
  const interpreter = new Interpreter(dsp, program);
  let steps = 0;
  while (!interpreter.atEnd && steps < maxSteps) {
    steps++;
    const { line, error } = interpreter.step();
    if (error) {
      errors.push(`ERROR ${line}: ${error.errorMsg}`);
      break;
    }
  }
  return { dsp, program, errors, steps };
}

const reg = (r: Run, name: 'EAX' | 'EBX' | 'ECX' | 'EDX' | 'ESP' | 'EBP' | 'EIP') =>
  r.dsp.shortcut(r.dsp[name]);

const STACK_ERROR = 'Memory address out of range. Might be a stack over-/underflow.';

const CONDITIONS = [
  'A',
  'AE',
  'B',
  'BE',
  'C',
  'E',
  'G',
  'GE',
  'L',
  'LE',
  'NA',
  'NAE',
  'NB',
  'NBE',
  'NC',
  'NE',
  'NG',
  'NGE',
  'NL',
  'NLE',
  'NO',
  'NP',
  'NS',
  'NZ',
  'O',
  'P',
  'PE',
  'PO',
  'S',
  'Z',
];

interface Flags {
  cf: boolean;
  zf: boolean;
  sf: boolean;
  of: boolean;
  pf: boolean;
}

/** Independent reference for the condition codes (Intel SDM). */
function expectedCC(cc: string, f: Flags): boolean {
  const base: Record<string, boolean> = {
    A: !f.cf && !f.zf,
    AE: !f.cf,
    B: f.cf,
    BE: f.cf || f.zf,
    C: f.cf,
    E: f.zf,
    G: !f.zf && f.sf === f.of,
    GE: f.sf === f.of,
    L: f.sf !== f.of,
    LE: f.zf || f.sf !== f.of,
    O: f.of,
    P: f.pf,
    PE: f.pf,
    PO: !f.pf,
    S: f.sf,
    Z: f.zf,
  };
  if (cc in base) return base[cc];
  if (cc.startsWith('N')) {
    const rest = cc.substring(1);
    return !base[rest];
  }
  throw new Error(cc);
}

/** POPFD source setting CF ZF SF OF PF from `f`. */
function flagsSource(f: Flags): string {
  const word =
    (f.cf ? 1 : 0) | (f.pf ? 4 : 0) | (f.zf ? 0x40 : 0) | (f.sf ? 0x80 : 0) | (f.of ? 0x800 : 0);
  return `push dword ${word}\npopfd\n`;
}

describe('SETcc (07 Q-I-11)', () => {
  const combos: Flags[] = [];
  for (let bits = 0; bits < 32; bits++) {
    combos.push({
      cf: !!(bits & 1),
      zf: !!(bits & 2),
      sf: !!(bits & 4),
      of: !!(bits & 8),
      pf: !!(bits & 16),
    });
  }

  it.each(CONDITIONS)('SET%s is registered and matches its condition', (cc) => {
    for (const f of combos) {
      const r = run(`${flagsSource(f)}mov bl, 0x55\nset${cc.toLowerCase()} bl\n`);
      expect(r.errors).toEqual([]);
      expect(reg(r, 'EBX')).toBe(expectedCC(cc, f) ? 1n : 0n);
    }
  });

  it('writes a byte to memory and leaves the neighbours alone', () => {
    const r = run(
      'x: dd 0xFFFFFFFF\nstc\nsetc byte [x]\nmov eax, [x]\nclc\nmov edi, x\nsetc byte [edi+1]\nmov ebx, [x]',
    );
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EAX')).toBe(0xffffff01n);
    expect(reg(r, 'EBX')).toBe(0xffff0001n);
  });

  it('writes only the addressed 8-bit register', () => {
    const r = run('mov eax, 0x12345678\nstc\nsetb ah');
    expect(reg(r, 'EAX')).toBe(0x12340178n);
  });

  it('rejects non-8-bit operands, immediates and a second operand', () => {
    for (const operand of ['eax', 'ax', '5', 'dword [0]', '[0]', 'bl, al']) {
      const r = run(`sete ${operand}`);
      expect(r.errors[0]).toMatch(/^PARSE 0: /);
    }
    expect(run('sete').errors[0]).toMatch(/^PARSE 0: /);
  });
});

describe('CALL / RET', () => {
  it('calls a label and returns to the next line', () => {
    const r = run('call sub\nmov ebx, 7\njmp end\nsub: mov eax, 5\nret\nend: nop');
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EAX')).toBe(5n);
    expect(reg(r, 'EBX')).toBe(7n);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('pushes the line after the CALL as a 4-byte return address', () => {
    const r = run('nop\ncall sub\nsub: mov eax, [esp]');
    expect(reg(r, 'EAX')).toBe(2n);
    expect(reg(r, 'ESP')).toBe(0xffcn);
  });

  it('supports nested calls', () => {
    const r = run(
      'call a\njmp end\na: call b\ninc eax\nret\nb: inc eax\ninc eax\nret\nend: mov ebx, esp',
    );
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EAX')).toBe(3n);
    expect(reg(r, 'EBX')).toBe(0x1000n);
  });

  it('calls a line number held in a register', () => {
    const r = run('mov ecx, 3\ncall ecx\njmp 5\ninc eax\nret\nnop');
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EAX')).toBe(1n);
  });

  it('raises the stack error on RET with an empty stack, keeping EIP on the RET', () => {
    const r = run('mov eax, 1\nret\nmov eax, 2');
    expect(r.errors).toEqual([`ERROR 1: ${STACK_ERROR}`]);
    expect(reg(r, 'EIP')).toBe(1n);
    expect(reg(r, 'ESP')).toBe(0x1000n);
    expect(reg(r, 'EAX')).toBe(1n);
  });

  it('RET is bound by the top of memory, not EBP (07 Q-S-1)', () => {
    const r = run('call sub\njmp end\nsub: mov ebp, esp\nret\nend: nop');
    expect(r.errors).toEqual([]);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('rejects a RET operand', () => {
    expect(run('ret 4').errors[0]).toMatch(/^PARSE 0: /);
  });
});

describe('JMP / LOOP', () => {
  it('LOOP with ECX = 0 wraps to 0xFFFFFFFF and jumps', () => {
    const r = run('top: loop end\nend: nop', 5);
    expect(reg(r, 'ECX')).toBe(0xffffffffn);
    expect(r.errors).toEqual([]);
  });

  it('LOOPE stops when ZF is clear', () => {
    const r = run('mov ecx, 5\nclc\ntop: inc eax\nloope top');
    // ZF = 0 after inc eax (1) so the loop ends after one round.
    expect(reg(r, 'EAX')).toBe(1n);
    expect(reg(r, 'ECX')).toBe(4n);
  });

  it('JECXZ / JCXZ test the counter', () => {
    const r = run('mov ecx, 0x10000\njcxz a\nmov eax, 1\na: jecxz b\nmov ebx, 1\nb: nop');
    expect(reg(r, 'EAX')).toBe(0n);
    expect(reg(r, 'EBX')).toBe(1n);
  });
});

describe('POPF / PUSHF', () => {
  it('POPF on an empty stack does nothing and raises no error (07 Q-I-15)', () => {
    const r = run('stc\nstd\npopf\npopfd');
    expect(r.errors).toEqual([]);
    expect(r.dsp.fCarry).toBe(true);
    expect(r.dsp.fDirection).toBe(true);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('POPF with fewer bytes than needed does nothing', () => {
    const r = run('push word 0x801\npopfd');
    expect(r.errors).toEqual([]);
    expect(r.dsp.fCarry).toBe(false);
    expect(reg(r, 'ESP')).toBe(0xffen);
  });

  it('POPF is bound by the top of memory, not EBP (07 Q-S-1)', () => {
    const r = run('push dword 0xC5\nmov ebp, esp\npopfd');
    expect(r.errors).toEqual([]);
    expect(r.dsp.fCarry).toBe(true);
    expect(r.dsp.fParity).toBe(true);
    expect(r.dsp.fZero).toBe(true);
    expect(r.dsp.fSign).toBe(true);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('PUSHFD/POPFD round-trip OF, DF and TF; SAHF leaves them alone', () => {
    const r = run('push dword 0xD00\npopfd\npushfd\npop eax\nmov ebx, eax\nmov ah, 0\nsahf');
    expect(reg(r, 'EBX')).toBe(0xd02n);
    expect(r.dsp.fOverflow).toBe(true);
    expect(r.dsp.fDirection).toBe(true);
    expect(r.dsp.fTrap).toBe(true);
  });

  it('PUSHF pushes 2 bytes, PUSHFD 4', () => {
    expect(reg(run('pushf'), 'ESP')).toBe(0xffen);
    expect(reg(run('pushfd'), 'ESP')).toBe(0xffcn);
  });
});

describe('PUSHA / POPA', () => {
  it('PUSHA pushes 8 words including the original SP; POPA skips SP', () => {
    const r = run('mov eax, 0x11111234\npusha\nmov ax, 0\nmov sp, 0x0FF0\npopa');
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EAX')).toBe(0x11111234n);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('PUSHA stores SP as it was before the first push', () => {
    const r = run('pusha\nmov eax, [esp+6]');
    expect(reg(r, 'EAX') & 0xffffn).toBe(0x1000n);
  });

  it('POPAD on an empty stack raises the stack error (07 Q-S-1)', () => {
    const r = run('popad');
    expect(r.errors).toEqual([`ERROR 0: ${STACK_ERROR}`]);
    expect(reg(r, 'ESP')).toBe(0x1000n);
  });

  it('POPA after mov ebp, esp still works (bound is the top of memory)', () => {
    const r = run('mov ebx, 9\npusha\nmov ebp, esp\nmov ebx, 0\npopa');
    expect(r.errors).toEqual([]);
    expect(reg(r, 'EBX')).toBe(9n);
  });
});

describe('STD / CLD / STC / CLC / CMC', () => {
  it('sets and clears DF and CF', () => {
    const r = run('std\nstc\ncmc');
    expect(r.dsp.fDirection).toBe(true);
    expect(r.dsp.fCarry).toBe(false);
    const s = run('std\ncld\nclc\ncmc');
    expect(s.dsp.fDirection).toBe(false);
    expect(s.dsp.fCarry).toBe(true);
  });
});

describe('JASMINSLEEP', () => {
  it('asks Run to wait for the requested milliseconds', () => {
    const sleepOf = (source: string) => {
      const dsp = new DataSpace(4096, 0);
      const program = new Program(dsp);
      program.setText(source);
      const interpreter = new Interpreter(dsp, program);
      interpreter.beginRun(() => false);
      return interpreter.runSteps(10, () => false);
    };
    expect(sleepOf('jasminsleep 250')).toEqual({ kind: 'sleep', ms: 250 });
    expect(sleepOf('mov eax, 40\njasminsleep eax')).toEqual({ kind: 'sleep', ms: 40 });
    expect(sleepOf('d: equ 15\njasminsleep d')).toEqual({ kind: 'sleep', ms: 15 });
  });

  it('rejects a missing or extra operand', () => {
    expect(run('jasminsleep').errors[0]).toMatch(/^PARSE 0: /);
    expect(run('jasminsleep 1, 2').errors[0]).toMatch(/^PARSE 0: /);
  });
});
