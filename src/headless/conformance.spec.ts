import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DataSpace,
  Interpreter,
  Program,
  formatStateDump,
  machineStateOf,
  runHeadless,
} from '../app/core';

const programs = join(__dirname, '../../spec/conformance/programs');

/** Every conformance program, by base name. */
const PROGRAMS = readdirSync(programs)
  .filter((f) => f.endsWith('.asm'))
  .map((f) => f.slice(0, -'.asm'.length))
  .sort();

describe('conformance programs', () => {
  it('finds the programs', () => {
    expect(readdirSync(programs).filter((f) => f.endsWith('.asm')).length).toBeGreaterThanOrEqual(
      44,
    );
  });

  it.each(PROGRAMS)('%s', (name) => {
    const port = join(programs, `${name}.port.expected`);
    const expected = readFileSync(
      existsSync(port) ? port : join(programs, `${name}.expected`),
      'utf8',
    );
    const normalize = (lines: string[]) =>
      lines
        .map((l) => l.trimEnd())
        .join('\n')
        .trim();
    expect(normalize(runHeadless(readFileSync(join(programs, `${name}.asm`), 'utf8')))).toBe(
      normalize(expected.split('\n')),
    );
  });

  it.each(PROGRAMS)('%s gives the same result with Run as with Step', (name) => {
    const source = readFileSync(join(programs, `${name}.asm`), 'utf8');
    const dsp = new DataSpace(4096, 0);
    const program = new Program(dsp);
    program.setText(source);
    const interpreter = new Interpreter(dsp, program);
    const output: string[] = [];
    interpreter.beginRun(() => false);
    for (let batches = 0; batches < 100; batches++) {
      const outcome = interpreter.runSteps(1000, () => false);
      if (outcome.kind === 'continue' || outcome.kind === 'sleep') continue;
      if (outcome.kind === 'error')
        output.push(`ERROR line ${outcome.line}: ${outcome.error.errorMsg}`);
      break;
    }
    interpreter.endRun();
    output.push(...formatStateDump(machineStateOf(dsp)));
    expect(output).toEqual(runHeadless(source).filter((line) => !line.startsWith('PARSE ')));
  });
});
