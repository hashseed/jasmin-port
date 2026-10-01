/**
 * Headless runner for the conformance tests (spec 08 §4):
 *   node dist/headless/run.js program.asm
 * Runs one program on a fresh 4096-byte machine and prints the final state in the
 * Java reference harness format. Imports only the interpreter core.
 */
import { readFileSync } from 'node:fs';
import { runHeadless } from '../app/core';

function main(argv: string[]): number {
  const [file] = argv;
  if (!file) {
    process.stderr.write('usage: node run.js program.asm\n');
    return 2;
  }
  process.stdout.write(runHeadless(readFileSync(file, 'utf8')).join('\n') + '\n');
  return 0;
}

process.exitCode = main(process.argv.slice(2));
