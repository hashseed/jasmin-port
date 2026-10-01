import { DataSpace } from './data-space';
import { Interpreter } from './interpreter';
import { Program } from './program';
import { formatStateDump, machineStateOf } from './state-dump';

/**
 * Runs a program like the Java reference harness (spec 08 §2, §4) and returns
 * the output lines: PARSE errors, the first runtime error, and the final state.
 */
export function runHeadless(source: string, maxSteps = 100000): string[] {
  const dsp = new DataSpace(4096, 0);
  const program = new Program(dsp);
  program.setText(source);
  const output: string[] = [];
  program.results.forEach((result, line) => {
    if (result.error) {
      const e = result.error;
      output.push(`PARSE line ${line}: ${e.errorMsg} @${e.startPos}+${e.length}`);
    }
  });
  const interpreter = new Interpreter(dsp, program);
  let steps = 0;
  while (!interpreter.atEnd && steps++ < maxSteps) {
    const { line, error } = interpreter.step();
    if (error) {
      output.push(`ERROR line ${line}: ${error.errorMsg}`);
      break;
    }
  }
  output.push(...formatStateDump(machineStateOf(dsp)));
  return output;
}
