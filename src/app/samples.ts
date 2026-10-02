import type { DeviceKind } from './devices';

/**
 * Sample programs listed on the Welcome page. The files are in `public/samples/`.
 * The algorithms were written in 2007 by one of Jasmin's original authors and
 * updated to the current syntax; they are also conformance programs
 * (`spec/conformance/programs/NN-sample-*.asm`). The device samples drive one I/O
 * device each and run until stopped, pausing with `JASMINSLEEP`.
 */
export interface Sample {
  /** File name under `samples/`, also the title of the opened document. */
  readonly file: string;
  /** Name shown in the list. */
  readonly title: string;
  /** The device tab selected when the sample opens. */
  readonly device?: DeviceKind;
}

export const ALGORITHM_SAMPLES: readonly Sample[] = [
  { file: 'ackermann.asm', title: 'Ackermann function' },
  { file: 'bubblesort.asm', title: 'Bubblesort' },
  { file: 'fibonacci.asm', title: 'Fibonacci numbers' },
  { file: 'mergesort.asm', title: 'Mergesort' },
  { file: 'primes.asm', title: 'Prime factorization' },
  { file: 'quicksort.asm', title: 'Quicksort' },
  { file: 'sqrt.asm', title: 'Square root' },
];

export const DEVICE_SAMPLES: readonly Sample[] = [
  { file: 'counter.asm', title: 'Counter (7-Segment)', device: '7-Segment' },
  { file: 'running-light.asm', title: 'Running light (StripLight)', device: 'StripLight' },
  { file: 'fizzbuzz.asm', title: 'FizzBuzz (Console)', device: 'Console' },
  { file: 'life.asm', title: 'Game of Life (Graphics)', device: 'Graphics' },
];

export const SAMPLES: readonly Sample[] = [...ALGORITHM_SAMPLES, ...DEVICE_SAMPLES];
