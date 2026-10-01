# 08. Conformance tests

## 1. What is here

| Path | Contents |
|---|---|
| `conformance/programs/NN-name.asm` | 44 small programs covering every instruction family, data directives, addressing, labels, errors and runtime faults. 43 and 44 are the only tests in the original repository (`tests/carry-sub_add.asm`, `tests/overflow-sub_add.asm`, copied unchanged): 16 8-bit ADD/SUB cases each, recording CF or OF as bits in BX. Their final comment states the intended BX, which the original matches (`0xD48E`, `0x4218`) and which equals real x86 |
| `conformance/programs/NN-name.expected` | Final machine state produced by the **original** Java interpreter (pinned commit) |
| `conformance/programs/NN-name.port.expected` | Expected output of the **port**, only for the 22 programs where an owner-approved fix changes the result (§3). Other programs share `NN-name.expected` |
| `conformance/run-conformance.sh` | Runs the programs against either implementation and compares (§4) |
| `conformance/mnemonics.txt` | The 230 mnemonics the original registers |
| `reference-harness/` | `Run.java`, `LabelSource.java`, `run-original.sh`: rebuilds the original core headlessly from GitHub and runs `.asm` files. Setup and usage: [reference-harness/README.md](reference-harness/README.md) |

`bash reference-harness/run-original.sh conformance/programs/*.asm` regenerates the
`.expected` files exactly (checked from a clean clone). Use it to settle any question
about original behavior: write a program, run it, read the output.

## 2. Harness semantics and output format

The harness reproduces a **Run from a fresh document** with default settings (4096
bytes, offset 0), without breakpoints:

1. Parse every line twice in order (so forward label references resolve), using the
   same "previous label-only line" rule as the editor. Report each line's parse error
   as `PARSE line N: <message> @<start>+<length>` (span within the upper-cased line).
   A parser crash prints `PARSE-EXCEPTION line N: <Exception>`.
2. Execute like Step repeatedly: `ln := EIP; EIP := ln+1; execute line ln` until
   `EIP >= lineCount` or an error. A returned error prints `ERROR line N: <message>`, a
   thrown exception prints `EXCEPTION line N: <class>: <message>`; both stop the run.
3. Print the final state:

```
EAX=0x........ EBX=... ECX=... EDX=... ESI=... EDI=... ESP=... EBP=... EIP=0x........
CF=0 OF=0 SF=0 ZF=0 PF=0 AF=0 DF=0
MEM (non-zero bytes): AAAA:VV AAAA:VV ...
FPU: <name>=<value> x8, in physical register order R0..R7, names ST((i-TOP) mod 8), values in Java Double.toString format
```

**Requirement:** the port ships an equivalent headless runner (§4) that prints the same
format, so the same programs run against both implementations.

## 3. Port expectations that differ from the original (FIX items)

For these programs the port must produce the original `.expected` output **with the
listed changes**; everything not listed stays identical. The changed outputs are
checked in as `NN-name.port.expected`, which is what the test runner compares against;
this table explains them. When a FIX/KEEP decision changes, update both.

| Program | Quirk | Changes vs. original output |
|---|---|---|
| 02-add-sub-flags | Q-F-1 | `AF=1` |
| 03-adc-sbb-cmp | Q-F-1 | `AF=0` |
| 07-imul-forms | Q-I-2 | `CF=0 OF=0` |
| 11-shld-shrd | Q-I-9 | `ECX=0xF0123456`; flags `CF=0 OF=0 SF=1 ZF=0 PF=1 AF=0` |
| 13-xchg-xadd-cmpxchg | Q-F-1 | `AF=0` |
| 18-jumps-loops | Q-F-1 | `AF=0` |
| 20-conditional-moves | Q-F-1 | `AF=1` |
| 21-signed-unsigned-jcc | Q-F-1 | `AF=0` |
| 25-string-ops | Q-F-1 | `AF=0` |
| 26-cmps | Q-F-1 | `AF=1` |
| 27-bcd | Q-I-10 | `PF=0` |
| 30-errors | Q-E-1, Q-P-6 | `EIP=0x00000000`; line 8's message reads `...prefixes are allowed here` |
| 31-runtime-stack-underflow | Q-E-1 | `EIP=0x00000000` |
| 32-runtime-ebp-bound | Q-S-1, Q-I-13 | no `ERROR` line; `EAX=0x00000002 ESP=0x00000FFC EBP=0x00000FF8 EIP=0x00000004`; `MEM (non-zero bytes): 0FF8:02 0FFC:01` |
| 33-runtime-div-zero | Q-I-3, Q-E-1 | `EXCEPTION ...` becomes `ERROR line 2: Division by zero`; `EIP=0x00000002` |
| 34-runtime-mem-oob | Q-E-1 | `EIP=0x00000001` |
| 35-push-sizes | Q-I-13 | no `ERROR` line; `EAX=0x00060000 EBX=0x00000005 ESP=0x00001000 EIP=0x00000008`; `MEM (non-zero bytes): 0FF6:07 0FFA:06 0FFC:05` |
| 36-setcc-broken | Q-I-11 | no `PARSE`/`ERROR` lines; `EBX=0x00000001` |
| 37-idiv-negative | Q-I-1 | `EAX=0xFFFFFFFD EDX=0xFFFFFFFF` |
| 39-bt-register-crash | Q-I-5 | no `EXCEPTION` line; `EIP=0x00000002`; `CF=1` |
| 40-cmpxchg-notequal | Q-I-4, Q-F-1 | `EAX=0x00000006`; `AF=1` |
| 42-imul-flags | Q-I-2 | `CF=0 OF=0` |

The Q-F-1 and Q-I-13 rows were produced by running the original with those two fixes
patched in (correct `AF` formula; `PUSH`/`POP` default size 4), so they are exact.
`16-stack` uses `push word 0x1234` so that its output is the same before and after
Q-I-13.

All other programs (01, 04-06, 08-10, 12, 14-17, 19, 22-24, 28-29, 38, 41, 43, 44) must match
the original output byte for byte.

## 4. Running the tests against both implementations

**Requirement (owner):** the conformance tests run headlessly against both the original
Java interpreter and the TypeScript port, with one command:

```
bash spec/conformance/run-conformance.sh java            # original, vs. NN.expected
JASMIN_TS_RUNNER="node <path>/run.js" \
  bash spec/conformance/run-conformance.sh ts            # port, vs. NN.port.expected or NN.expected
bash spec/conformance/run-conformance.sh ts programs/07-imul-forms.asm   # a subset
```

The script prints a diff for each failing program and a pass/fail count, ignores
trailing whitespace on each line, and exits non-zero if anything fails, so CI can run
both modes. `java` needs a JDK and git (see `reference-harness/README.md`).

What the port must provide for `ts` mode:

- A Node command-line entry point (e.g. `src/headless/run.ts`, built to a single
  `run.js`) that takes one `.asm` path, runs it exactly like the Java driver in §2
  (fresh document, 4096 bytes at offset 0, parse twice, step until past the last line,
  an error, or 100000 steps), and prints the same four sections in the same format.
  Messages are the port's own (with the FIX items applied), so `PARSE`, `ERROR` and the
  register dump must match `NN.port.expected`.
- The port has no Java exceptions, so it never prints `EXCEPTION` or `PARSE-EXCEPTION`.
  Any such line in an expectation is replaced by a FIX in §3.
- The entry point imports only the interpreter core (01 §2 `core/`), never Angular, the
  DOM or browser APIs. This also keeps the core testable with a plain unit-test runner.
- FPU values print in Java `Double.toString` format (02 §9), the same formatter the UI
  uses.

New conformance programs are added by writing `NN-name.asm`, generating
`NN-name.expected` with the Java harness, and adding `NN-name.port.expected` plus a row
in §3 only if a FIX changes the result.

## 5. Additional tests the port should add

The golden programs cover the interpreter core. The port also needs tests for:

- **Parser details** from 03: every number-literal form (incl. fixed `$` hex), label
  validity, the error catalogue with exact spans, `humanNamesArray` messages for every
  allowed-type set used by an instruction (generate them with the harness by feeding
  wrong operand types).
- **Dirty tracking** (04 §8): which cells are bold after Step vs. Run.
- **UI enablement** (02 §4) and register/memory formatting (02 §7, §10), including
  Java `Double.toString` formatting in the FPU table.
- **Devices** (06): bit-to-segment/lamp/pixel mapping, console array and pipe modes.
- **FIX items** not covered above: Q-P-1, Q-P-3, Q-P-4, Q-P-6, Q-I-6, Q-I-7, Q-I-8,
  Q-I-14, Q-I-16 (`cmove al, bl`, `cmove eax, 5` rejected), Q-FPU-1, Q-SN-1, Q-SN-2, plus `AF` after `DEC`/`NEG`/`SBB`/`SCAS` (Q-F-1) and
  `push 100000` / `pop [x]` sizes (Q-I-13).
