/**
 * Benchmark runner (bench/README.md):
 *   node dist/headless/bench.js program.asm [memory bytes]
 * Runs a program the way the app's Run does (per-run parse cache, no step limit)
 * on a fresh machine, prints the final state in the reference harness format on
 * stdout and `ms=<run time>` on stderr. Parsing the
 * program is not timed.
 */
import { readFileSync } from 'node:fs';
import { DataSpace, Interpreter, Program, formatStateDump, machineStateOf } from '../app/core';

function main(argv: string[]): number {
  const [file, memory = '4096'] = argv;
  if (!file) {
    process.stderr.write('usage: node bench.js program.asm [memory bytes]\n');
    return 2;
  }
  const dsp = new DataSpace(Number(memory), 0);
  const program = new Program(dsp);
  program.setText(readFileSync(file, 'utf8'));
  const interpreter = new Interpreter(dsp, program);
  const noBreakpoints = () => false;
  const output: string[] = [];

  const start = process.hrtime.bigint();
  interpreter.beginRun(noBreakpoints);
  let outcome = interpreter.runSteps(1_000_000, noBreakpoints);
  while (outcome.kind === 'continue' || outcome.kind === 'sleep') {
    outcome = interpreter.runSteps(1_000_000, noBreakpoints);
  }
  if (outcome.kind === 'error') {
    output.push(`ERROR line ${outcome.line}: ${outcome.error.errorMsg}`);
  }
  interpreter.endRun();
  const ms = Number(process.hrtime.bigint() - start) / 1e6;

  process.stdout.write([...output, ...formatStateDump(machineStateOf(dsp))].join('\n') + '\n');
  process.stderr.write(`ms=${ms.toFixed(0)}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
