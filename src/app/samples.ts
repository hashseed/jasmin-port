/**
 * Sample programs listed on the Welcome page. The files are in `public/samples/`
 * and are also conformance programs (`spec/conformance/programs/NN-sample-*.asm`).
 * Written in 2007 by one of Jasmin's original authors, with German labels, and
 * updated to the current syntax.
 */
export interface Sample {
  /** File name under `samples/`, also the title of the opened document. */
  readonly file: string;
  /** Name shown in the list. */
  readonly title: string;
}

export const SAMPLES: readonly Sample[] = [
  { file: 'ackermann.asm', title: 'Ackermann function' },
  { file: 'bubblesort.asm', title: 'Bubblesort' },
  { file: 'fibonacci.asm', title: 'Fibonacci numbers' },
  { file: 'mergesort.asm', title: 'Mergesort' },
  { file: 'prim.asm', title: 'Prime factorization' },
  { file: 'quicksort.asm', title: 'Quicksort' },
  { file: 'wurzel.asm', title: 'Square root' },
];
