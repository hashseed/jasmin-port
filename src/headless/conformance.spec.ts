import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { runHeadless } from '../app/core';

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
});
