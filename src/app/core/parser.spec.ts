import { describe, expect, it } from 'vitest';
import { DataSpace } from './data-space';
import { Op } from './op';
import { Program } from './program';

function parseLine(source: string, line = 0) {
  const program = new Program(new DataSpace(4096, 0));
  program.setText(source);
  return program.result(line);
}

function errorOf(source: string, line = 0) {
  const e = parseLine(source, line).error;
  return e && `${e.errorMsg} @${e.startPos}+${e.length}`;
}

describe('parser error catalogue (spec 03 §9)', () => {
  it.each([
    ['eax: nop', 'Invalid Label @0+3'],
    ['10: nop', 'Invalid Label @0+2'],
    ['byte: nop', 'Invalid Label @0+4'],
    ['rep: nop', 'Invalid Label @0+3'],
    ['foo eax', 'Unknown command @0+3'],
    ['mov eax, undefined_name', 'Invalid Expression @9+14'],
    ['mov eax, , ebx', 'A comma must only be placed after a parameter @9+1'],
    ['mov eax ebx', 'You must place a comma between any two parameters @8+3'],
    ['byte eax', 'Only an immediate or a memory location is allowed after a size qualifier @5+3'],
    ['mov [0], byte 300', 'Operand does not match previous size qualifier. @14+3'],
    ['movsb rep', 'Prefixes must be placed before the command @6+3'],
    ['equ 5', 'Preprocessor commands must be preceded by a label. @0+3'],
    ['mov [eax], [ebx]', 'Only one memory access allowed. @11+5'],
    ['mov eax, [esi*2+ebx]', 'Malformed memory address @9+11'],
    ['mov eax, [eax]]', 'Malformed memory address @9+6'],
    ['mov [eax*3], 1', 'Scale factor must be either 1, 2, 4, or 8. @4+7'],
    ['mov [esp*2], 1', 'ESP cannot be used as an index register. @4+7'],
    ['mov [ax], 1', 'Only 32bit registers are valid for address calculation. @4+4'],
    ['mov [5000], 1', 'Memory address out of range @4+6'],
    ['mov eax, bl', 'Size mismatch @9+2'],
    ['mov al, 256', 'Operand too large, does not fit into destination. @8+3'],
    ['mov al, -129', 'Operand too large, does not fit into destination. @8+4'],
    [
      'mov 5, eax',
      'Invalid parameter. Must specify a register or a memory address as destination. @4+1',
    ],
    ['push al', 'Operand must be at least 2 bytes large @5+2'],
    ['db 300', 'Operand must not be larger than 1 byte @3+3'],
    ['rep cmpsb', 'Only the REPE/REPZ/REPNE/REPNZ prefixes are allowed here @0+3'],
    ['repe movsb', 'Only the REP prefix is allowed here @0+4'],
    ['resb 0', 'invalid reservation size @5+1'],
    ['inc [4]', 'Operand must be a register, or an 8bit, 16bit or 32bit memory location.  @4+3'],
    ['nop 1', 'Operand must be empty.  @4+1'],
    ['mov eax, [ebx], ecx', 'Operand must be empty.  @16+3'],
    ['cmove al, bl', 'Operand must be a 16bit or 32bit register.  @6+2'],
    [
      'cmove eax, 5',
      'Operand must be a 16bit or 32bit register, or a 16bit or 32bit memory location.  @11+1',
    ],
    ['cmove eax, bx', 'Size mismatch @11+2'],
  ])('%s', (source, expected) => {
    expect(errorOf(source)).toBe(expected);
  });

  it('accepts valid labels and operands', () => {
    for (const source of [
      'loop1: nop',
      '.x: nop',
      '1abc: nop',
      'mov al, 255',
      'mov al, -128',
      'mov eax, [ ebx + 4 ]',
      'mov eax, [ebx+esi*4-8]',
      "mov eax, 'abcd'",
      'mov eax, $1F',
      'movs byte [edi], [esi]',
      'cmove eax, ebx',
      'cmove ax, [0]',
    ]) {
      expect(errorOf(source), source).toBeNull();
    }
  });

  it('records comments and labels', () => {
    const r = parseLine("x: mov eax, 1 ; set ',' here");
    expect(r.label).toBe('X');
    expect(r.mnemo).toBe('MOV');
    expect(r.commentStartPos).toBe(14);
    expect(r.originalLine).toBe("X: MOV EAX, 1 ; SET ',' HERE");
  });
});

describe('Program', () => {
  it('resolves forward label references and label kinds (spec 03 §7)', () => {
    const program = new Program(new DataSpace(4096, 0));
    program.setText('mov eax, end\nn: equ 5\nv: db 1\nend: nop');
    expect(program.results.map((r) => r.error)).toEqual([null, null, null, null]);
    expect(program.getLabelLine('END')).toBe(3);
    expect(program.dsp.isConstant('N')).toBe(true);
    expect(program.dsp.getConstant('N')).toBe(5n);
    expect(program.dsp.isVariable('V')).toBe(true);
    expect(program.parser.getOperandType('END')).toBe(Op.LABEL);
  });

  it('attaches a label-only line to the next non-empty line', () => {
    const program = new Program(new DataSpace(4096, 0));
    program.setText('data:\n\n  dd 42');
    expect(program.result(0).labelOnly).toBe(true);
    expect(program.lastLabel(2)).toBe('DATA');
    expect(program.dsp.isVariable('DATA')).toBe(true);
  });

  it('reports duplicate labels at the later definition', () => {
    const program = new Program(new DataSpace(4096, 0));
    program.setText('x: nop\nx: nop');
    expect(program.result(0).error).toBeNull();
    expect(program.result(1).error?.errorMsg).toBe('Label already defined in line 0');
  });

  it('forgets variables whose label disappeared', () => {
    const program = new Program(new DataSpace(4096, 0));
    program.setText('v: db 1');
    expect(program.dsp.isVariable('V')).toBe(true);
    program.setText('db 1\nmov eax, v');
    expect(program.dsp.isVariable('V')).toBe(false);
    expect(program.result(1).error?.errorMsg).toBe('Invalid Expression');
  });
});
