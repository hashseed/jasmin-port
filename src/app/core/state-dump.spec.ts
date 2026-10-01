import { describe, expect, it } from 'vitest';
import { createInitialState } from './machine-state';
import { formatStateDump } from './state-dump';

describe('formatStateDump', () => {
  it('prints a fresh 4096-byte machine like the Java harness', () => {
    expect(formatStateDump(createInitialState())).toEqual([
      'EAX=0x00000000 EBX=0x00000000 ECX=0x00000000 EDX=0x00000000 ESI=0x00000000 ' +
        'EDI=0x00000000 ESP=0x00001000 EBP=0x00001000 EIP=0x00000000 ',
      'CF=0 OF=0 SF=0 ZF=0 PF=0 AF=0 DF=0',
      'MEM (non-zero bytes):',
      'FPU: ST0=0.0 ST1=0.0 ST2=0.0 ST3=0.0 ST4=0.0 ST5=0.0 ST6=0.0 ST7=0.0',
    ]);
  });

  it('lists non-zero bytes and names FPU registers relative to TOP', () => {
    const base = createInitialState();
    const memory = new Uint8Array(4096);
    memory[0] = 0x2a;
    memory[0xffc] = 1;
    const [, , mem, fpu] = formatStateDump({
      ...base,
      memory,
      fpu: { top: 7, registers: [0, 0, 0, 0, 0, 0, 0, 1.5] },
    });
    expect(mem).toBe('MEM (non-zero bytes): 0000:2A 0FFC:01');
    expect(fpu).toBe('FPU: ST1=0.0 ST2=0.0 ST3=0.0 ST4=0.0 ST5=0.0 ST6=0.0 ST7=0.0 ST0=1.5');
  });
});
