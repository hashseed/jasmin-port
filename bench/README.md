# Benchmark: bubblesort, original vs port

`bash bench/run-bench.sh [N ...]` (or `npm run bench -- N ...`) runs a bubblesort of N
dwords headlessly on the original Java interpreter and on the TypeScript port, checks
both results and prints the interpreter time of each. The default sizes are 100, 1000
and 10000.

- `bubblesort.mjs` generates the program: it fills N dwords at address 0 with a
  linear congruential generator, bubble-sorts them in place, and leaves a check in
  the registers (EAX = 1 if sorted, EBX = sum, EDI = sum of entry × (index + 1)).
  `node bench/bubblesort.mjs expect N` computes the same values in JavaScript.
- `Bench.java` runs a program like the original's Run (parser cache on, no step
  limit) on the build from `spec/reference-harness/`; `src/headless/bench.ts` runs it
  like the port's Run (`Interpreter.runSteps`). Both print the final state in the
  conformance format and the run time, excluding startup and parsing.
- A size is `ok` when both implementations produce the expected check values and
  the same final registers, flags, memory and FPU (AF excepted: the port computes it
  as x86 does, spec 07 Q-F-1).

Requirements are those of the reference harness (a JDK, network access for the first
clone) plus Node 24 and the npm dependencies. Times vary with the machine; the Java
time includes JIT warm-up, which matters only for small N.

## Results

On a 4-core Linux cloud container (OpenJDK 21, Node 24), 2026-10-02:

| Entries | Instructions | Java (ms) | TypeScript (ms) | TS / Java | Result |
| ------: | -----------: | --------: | --------------: | --------: | ------ |
|     100 |       52,861 |        29 |              43 |       1.5 | ok     |
|   1,000 |    5,025,009 |       186 |           2,120 |      11.4 | ok     |
|  10,000 |  500,721,593 |    12,503 |         197,017 |      15.8 | ok     |

The original runs about 40 million instructions per second, the port about 2.5
million. A CPU profile of the port puts most of the time in the Java `long`
emulation with `BigInt` (`core/java.ts`), above all in flag computation (`setFlags`).
