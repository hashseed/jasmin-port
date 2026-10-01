import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHeadless } from '../app/core';

const programs = join(__dirname, '../../spec/conformance/programs');

/** Conformance programs the core already handles; the list grows to all 44 in M2. */
const PASSING = [
  '01-mov-sizes',
  '05-inc-dec-neg',
  '22-data-directives',
  '24-label-on-own-line',
  '30-errors',
  '31-runtime-stack-underflow',
  '34-runtime-mem-oob',
  '35-push-sizes',
];

describe('conformance programs', () => {
  it('finds the programs', () => {
    expect(readdirSync(programs).filter((f) => f.endsWith('.asm')).length).toBeGreaterThanOrEqual(
      44,
    );
  });

  it.each(PASSING)('%s', (name) => {
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
});
