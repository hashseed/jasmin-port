import { DataSpace, Program } from '../../core';
import { HighlightRun, LabelKind, highlightLine } from './highlight';

function styled(source: string, lineIndex = 0): string[] {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(source);
  const kindOf = (label: string): LabelKind =>
    dsp.isConstant(label) ? 'constant' : dsp.isVariable(label) ? 'variable' : 'label';
  const line = program.line(lineIndex);
  return highlightLine(line, program.result(lineIndex), kindOf).map(
    (run: HighlightRun) => `${run.style}:${line.slice(run.from, run.to)}`,
  );
}

describe('highlightLine (spec 02 §6.3)', () => {
  it('styles mnemonic, registers and comment', () => {
    expect(styled('mov eax, ebx ; copy')).toEqual([
      'mnemonic:mov',
      'register:eax',
      'register:ebx',
      'comment:; copy',
    ]);
  });

  it('matches case-insensitively on whole tokens only', () => {
    // "eaxx" is not the register EAX; "Add" is the mnemonic.
    expect(styled('Add EAX, [eaxx]', 0)).toContain('mnemonic:Add');
    expect(styled('Add EAX, [eaxx]', 0)).not.toContain('register:eax');
  });

  it('colors labels by their current kind', () => {
    const source = 'n: equ 10\nv: dd 0\nstart: mov eax, n\nmov [v], eax\njmp start';
    expect(styled(source, 0)).toContain('constant:n');
    expect(styled(source, 1)).toContain('variable:v');
    expect(styled(source, 2)).toEqual([
      'label:start',
      'mnemonic:mov',
      'register:eax',
      'constant:n',
    ]);
    expect(styled(source, 3)).toContain('variable:v');
    expect(styled(source, 4)).toEqual(['mnemonic:jmp', 'label:start']);
  });

  it('underlines the error span, with the comment winning', () => {
    expect(styled('foo eax ; x')).toEqual(['error:foo', 'register:eax', 'comment:; x']);
    expect(styled('mov al, 256')).toContain('error:256');
  });

  it('returns nothing for empty lines', () => {
    expect(styled('   ')).toEqual([]);
  });
});
