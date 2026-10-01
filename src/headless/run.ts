/**
 * Headless runner for the conformance tests (spec 08 §4):
 *   node dist/headless/run.js program.asm
 * Runs one program on a fresh 4096-byte machine and prints the final state in the
 * Java reference harness format. Imports only the interpreter core.
 *
 * M0 stub: the parser and interpreter do not exist yet, so it prints the state of
 * a fresh machine without executing anything.
 */
import { readFileSync } from 'node:fs';
import { createInitialState, formatStateDump } from '../app/core';

function main(argv: string[]): number {
  const [file] = argv;
  if (!file) {
    process.stderr.write('usage: node run.js program.asm\n');
    return 2;
  }
  readFileSync(file, 'utf8');
  process.stderr.write('jasmin headless: interpreter not implemented yet (M0 stub)\n');
  process.stdout.write(formatStateDump(createInitialState()).join('\n') + '\n');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
