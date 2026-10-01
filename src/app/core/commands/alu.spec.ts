import { describe, expect, it } from 'vitest';
import { runHeadless } from '../headless';

/** Runs a program and returns its PARSE/ERROR lines, registers and flags. */
function run(source: string) {
  const lines = runHeadless(source);
  const values = new Map<string, string>();
  for (const line of lines) {
    if (line.startsWith('EAX=') || line.startsWith('CF=')) {
      for (const [, name, value] of line.matchAll(/(\w+)=(\S+)/g)) values.set(name, value);
    }
  }
  const messages = lines.filter((l) => l.startsWith('PARSE') || l.startsWith('ERROR'));
  return {
    messages,
    reg: (name: string) => parseInt(values.get(name) ?? 'NaN', 16),
    flag: (name: string) => values.get(name),
  };
}

describe('MOVZX/MOVSX validation (07 Q-I-6)', () => {
  const message =
    'Operand must be an 8bit or 16bit register, or an 8bit or 16bit memory location. ';

  it.each(['movzx eax, [0]', 'movsx eax, [0]', 'movzx eax, ebx', 'movsx eax, dword [0]'])(
    'rejects %s',
    (source) => {
      expect(run(source).messages[0]).toContain(`PARSE line 0: ${message}`);
    },
  );

  it('rejects a 16-bit source for a 16-bit destination', () => {
    expect(run('movzx ax, bx').messages[0]).toContain('PARSE line 0:');
  });

  it('accepts sized memory and reads only that many bytes', () => {
    const r = run('mov dword [0], 0x1234FF80\nmovzx eax, byte [0]\nmovsx ebx, word [0]');
    expect(r.messages).toEqual([]);
    expect(r.reg('EAX')).toBe(0x80);
    expect(r.reg('EBX')).toBe(0xffffff80);
  });
});

describe('shift counts (07 Q-I-7, Q-I-8)', () => {
  it('masks the count to 5 bits', () => {
    const r = run('mov eax, 1\nshl eax, 33\nmov ebx, 0x80\nshr ebx, 39');
    expect(r.reg('EAX')).toBe(2);
    expect(r.reg('EBX')).toBe(1);
  });

  it('treats a masked count of 0 as a no-op (flags kept)', () => {
    const r = run('mov al, 0xFF\nadd al, 1\nmov eax, 5\nshl eax, 32');
    expect(r.reg('EAX')).toBe(5);
    expect(r.flag('CF')).toBe('1');
  });

  it('SHR sets CF from the last bit shifted out, also for large counts', () => {
    expect(run('mov eax, 0xC0000000\nshr eax, 31').flag('CF')).toBe('1');
    expect(run('mov eax, 0x80000000\nshr eax, 31').flag('CF')).toBe('0');
    expect(run('mov eax, 0x00010000\nshr eax, 17').flag('CF')).toBe('1');
  });

  it('SHR by more than the operand size clears CF and the operand', () => {
    const r = run('mov al, 0xFF\nshr al, 9');
    expect(r.reg('EAX')).toBe(0);
    expect(r.flag('CF')).toBe('0');
  });

  it('SAR sets CF from the last bit shifted out (sign beyond the operand)', () => {
    expect(run('mov al, 0xC0\nsar al, 7').flag('CF')).toBe('1');
    expect(run('mov al, 0x80\nsar al, 7').flag('CF')).toBe('0');
    const r = run('mov al, 0x80\nsar al, 12');
    expect(r.reg('EAX')).toBe(0xff);
    expect(r.flag('CF')).toBe('1');
  });
});

describe('division errors (07 Q-I-3)', () => {
  it('reports a quotient that does not fit and changes no register', () => {
    const r = run('mov edx, 1\nmov eax, 0\nmov ebx, 1\ndiv ebx');
    expect(r.messages).toEqual(['ERROR line 3: Division overflow']);
    expect(r.reg('EAX')).toBe(0);
    expect(r.reg('EDX')).toBe(1);
  });

  it('reports 8-bit and 16-bit signed overflow', () => {
    expect(run('mov ax, 0x8000\nmov bl, 1\nidiv bl').messages).toEqual([
      'ERROR line 2: Division overflow',
    ]);
    expect(run('mov dx, 0xFFFF\nmov ax, 0x8000\nmov bx, -1\nidiv bx').messages).toEqual([
      'ERROR line 3: Division overflow',
    ]);
  });

  it('reports division by zero for every size', () => {
    expect(run('mov ax, 5\nmov bl, 0\ndiv bl').messages).toEqual([
      'ERROR line 2: Division by zero',
    ]);
    expect(run('mov cx, 0\nidiv cx').messages).toEqual(['ERROR line 1: Division by zero']);
  });

  it('divides a 16-bit signed dividend whose low half has bit 15 set', () => {
    const r = run('mov dx, 0\nmov ax, 0x8000\nmov bx, 2\nidiv bx');
    expect(r.messages).toEqual([]);
    expect(r.reg('EAX')).toBe(0x4000);
    expect(r.reg('EDX')).toBe(0);
  });
});

describe('AAM/AAD flags (07 Q-I-10)', () => {
  it('AAM sets ZF and PF from AL', () => {
    const r = run('mov al, 50\naam');
    expect(r.reg('EAX')).toBe(0x0500);
    expect(r.flag('ZF')).toBe('1');
    expect(r.flag('PF')).toBe('1');
    expect(r.flag('SF')).toBe('0');
  });

  it('AAD sets SF from AL', () => {
    const r = run('mov ax, 0x0D00\naad');
    expect(r.reg('EAX')).toBe(0x82);
    expect(r.flag('SF')).toBe('1');
    expect(r.flag('ZF')).toBe('0');
    expect(r.flag('PF')).toBe('1');
  });
});

describe('AF for subtraction (07 Q-F-1)', () => {
  it('SUB and CMPXCHG report the borrow out of bit 3', () => {
    expect(run('mov al, 0x10\nsub al, 1').flag('AF')).toBe('1');
    expect(run('mov eax, 0x10\nmov ebx, 1\ncmpxchg ebx, ecx').flag('AF')).toBe('1');
    expect(run('mov al, 0x80\nsub al, 0x18').flag('AF')).toBe('1');
  });

  it('ADD and XADD are unchanged', () => {
    expect(run('mov al, 0x0F\nadd al, 1').flag('AF')).toBe('1');
    expect(run('mov al, 0x0F\nmov bl, 1\nxadd al, bl').flag('AF')).toBe('1');
  });
});

describe('BT family with register destinations (07 Q-I-5)', () => {
  it('sets, resets and complements bits modulo the operand size', () => {
    const r = run('mov eax, 0\nbts eax, 35\nmov ebx, 0xFF\nbtr ebx, 0\nmov ecx, 1\nbtc ecx, 0');
    expect(r.messages).toEqual([]);
    expect(r.reg('EAX')).toBe(8);
    expect(r.reg('EBX')).toBe(0xfe);
    expect(r.reg('ECX')).toBe(0);
    expect(r.flag('CF')).toBe('1');
  });
});

describe('IMUL flags (07 Q-I-2)', () => {
  it('clears CF/OF for small negative products and sets them on overflow', () => {
    expect(run('mov eax, -1\nmov ebx, 2\nimul ebx').flag('CF')).toBe('0');
    expect(run('mov ax, 0x4000\nimul ax, 2').flag('OF')).toBe('1');
    expect(run('mov al, -64\nmov bl, 2\nimul bl').flag('OF')).toBe('0');
  });
});
