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

### After moving the core to numbers

The core now computes operands of up to 32 bits with plain numbers and keeps
`BigInt` only for 64-bit values (8-byte memory and FPU operands, MUL/IMUL products
beyond 2^62, DIV dividends beyond 2^53, rotates and double shifts). Same container,
2026-10-02:

| Entries | Instructions | Java (ms) | TypeScript (ms) | TS / Java | Result |
| ------: | -----------: | --------: | --------------: | --------: | ------ |
|     100 |       52,861 |        30 |              27 |       0.9 | ok     |
|   1,000 |    5,025,009 |       229 |             327 |       1.4 | ok     |
|  10,000 |  500,721,593 |    13,302 |          29,000 |       2.2 | ok     |

The port now runs about 15 million instructions per second (1,000 entries: 2,120 ms
on the original main, 1,328 ms with number flags, 327 ms now).

## In the browser

`npm run bench:browser -- [--no-build] [N ...]` (`node bench/browser-bench.mjs`) runs
the same programs in the app itself: it builds the production app (`ng build`; with
`--no-build` it reuses an existing `dist/`), serves it on a free local port, opens it
in Chromium (`PW_CHROMIUM_PATH`, else `/opt/pw-browsers/chromium` if present, else
Playwright's own) with the memory setting 65536, pastes the program into a new
document and clicks Run. It times the run in the page, from the Run button showing a
run in progress until it no longer does, and checks EAX, EBX and EDI in the
Registers panel against `bubblesort.mjs expect N`. The default sizes are 1000 and
10000. Unlike the headless runner, this includes everything a user's Run pays for:
the attached I/O devices, the time slicing and the live panel refresh.

### Results

Same container, Chromium 141, 2026-10-02 (times in ms; headless is the TypeScript
column of `npm run bench`, browser the median of several `bench:browser` runs):

| Entries | Headless | Browser, before | Browser, after |
| ------: | -------: | --------------: | -------------: |
|   1,000 |       81 |             175 |            100 |
|  10,000 |    1,900 |           9,800 |          2,850 |

Before, a run in the app took five times as long as headless:

- The I/O devices listened to every memory write, which sent every write of Run (in
  compiled code and in the interpreter) down the slow path that notifies listeners
  byte by byte. Listeners now declare the address ranges they watch (the devices'
  bytes, which follow their configuration), and only writes overlapping a watched
  range take the slow path: 10,000 entries 9.8 s → 3.4 s.
- Run yielded to the event loop with `setTimeout(0)` between its 12 ms slices, and
  browsers delay nested timeouts by at least 4 ms. It now yields through a
  `MessageChannel` (`setImmediate` in Node): 3.4 s → 2.85 s. Input is still handled
  within a slice (about 10 ms) and rendering keeps 60 frames per second; a
  `setTimeout(0)` started during a run waits about 21 ms instead of 11 ms.

The rest of the gap to headless is mostly the live refresh of the panels every 100 ms,
which is kept so that the panels follow a run (without it, 10,000 entries take about
2.55 s). A `MachineSession` with devices in Node, which also pays for the time slicing,
went from 6.4 s to 2.15 s for 10,000 entries.

The live refresh cost about 15 ms per refresh, some 15 % of the run. A trace of 10,000
entries (about 30 refreshes) showed where: the accent animation of changed register
fields and memory rows kept the page repainting in every frame (about 130 ms of paint
and style), the editor re-highlighted its text inside Run's time slice and re-measured
its layout in the next frame (about 130 ms), Angular's change detection (about 40 ms),
and the layout and paint of the changed values (about 150 ms). Now (spec 04 §9.3) the
refresh is done in an animation frame, the accent animation is off while running, the
editor only moves its execution mark, the devices repaint only on writes to their bytes,
and panels out of view skip live refreshes until they are shown. What remains is
change detection and the layout and paint of the values that changed, about 10 ms per
refresh. Medians of 12 alternating `bench:browser` runs each, in ms:

| Entries | Before | After |
| ------: | -----: | ----: |
|   1,000 |    102 |   102 |
|  10,000 |  3,040 | 2,865 |

## Samples

`npm run bench:samples -- [--runs R] [--batch N] [--runner bench.js ...] [case ...]`
(`node bench/samples.mjs`) runs scaled-up versions of the samples in `public/samples`
headlessly, checks every result against a JavaScript computation and prints the median
run time of each (`--list` shows the cases). Each case keeps the sample's hot loops and
changes only its input: primes factors 90 × 3,999,971, sqrt runs 150,000 calls,
mergesort and quicksort sort 120,000 and 150,000 dwords (filled by a generator loop,
since Run parses each `dd` line when it first executes it), life runs 1,000
generations, fizzbuzz counts to 600,000, fibonacci computes fib(31) recursively and
ackermann A(3, 9). No sample shifts or rotates, so `crc32` (a table-less CRC-32 over
300,000 bytes, shift-heavy) is added. With several `--runner` bundles (built from
different commits) the runs alternate between them. `--batch N` runs Run's batches of
N lines (`BENCH_BATCH`; the app runs batches of 1000) instead of 1,000,000; `--emit
DIR` writes the programs instead.

### Results: compiled Run, four optimizations

Same container, 2026-10-02, medians of 5 alternating runs in ms. Each column adds one
commit to the one before: main; (1) shifts, rotates, MUL/IMUL/DIV/IDIV, MOVZX/MOVSX,
XCHG, SETcc, CMOVcc, CBW..CDQ and NOP compiled; (2) dead flag elimination; (3) inline
memory access for PUSH/POP of memory and BT*, and shorter code (one write-back
function, one exit), so that large regions keep their registers in locals; (4) stepwise
code for the end of a batch instead of interpreting its last lines.

Batches of 1,000,000 lines:

| Case      | main |  (1) |  (2) | (3) | (4) |
| --------- | ---: | ---: | ---: | --: | --: |
| primes    |  525 |  196 |  196 | 179 | 177 |
| sqrt      |  659 |  354 |  348 | 246 | 246 |
| mergesort | 1061 | 1016 | 1051 | 328 | 332 |
| quicksort | 1088 | 1040 | 1031 | 394 | 393 |
| life      |  640 |  676 |  630 | 280 | 282 |
| fizzbuzz  |  521 |  288 |  282 | 221 | 218 |
| fibonacci |  435 |  445 |  456 | 289 | 301 |
| ackermann |  578 |  587 |  611 | 467 | 448 |
| crc32     |  505 |  178 |  151 | 118 | 122 |

Batches of 1,000 lines, as in the app:

| Case      | main | (1) | (2) | (3) | (4) |
| --------- | ---: | --: | --: | --: | --: |
| primes    |  450 | 153 | 155 | 158 | 146 |
| sqrt      |  621 | 257 | 270 | 251 | 243 |
| mergesort |  368 | 358 | 372 | 255 | 258 |
| quicksort |  892 | 834 | 818 | 337 | 339 |
| life      |  732 | 741 | 705 | 322 | 302 |
| fizzbuzz  |  524 | 287 | 257 | 239 | 239 |
| fibonacci |  246 | 245 | 245 | 222 | 225 |
| ackermann |  502 | 527 | 513 | 460 | 424 |
| crc32     |  484 | 164 | 137 | 143 | 126 |

(1) pays off wherever these instructions are in a hot loop (primes, sqrt, fizzbuzz,
crc32). (2) mainly helps the shift-heavy crc32. (3) is the largest step for the
recursive and memory-bound cases: before it, the merge and quick sort regions were too
long for V8 to optimize with locals (they kept the registers in `V`), and V8
deoptimized long-running regions at their exits. (4) only matters with small batches.
Some cases are faster with batches of 1000 than of 1,000,000: V8 then optimizes the
region functions as a whole instead of by on-stack replacement of a running loop.

Bubblesort of 10,000 entries (`bench/bubblesort.mjs`, headless, batches of 1,000,000,
median of 3 alternating runs): main 1,754 ms, (1) 1,737, (2) 1,489, (3) 1,368, (4) 1,339.

In the browser (`bench:browser`, medians of 5 alternating runs of production builds of
main and of all four steps, in ms): 1,000 entries 112 → 77, 10,000 entries
2,357 → 1,750.
