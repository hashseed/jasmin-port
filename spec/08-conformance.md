# 08. Conformance tests

## 1. What is here

| Path | Contents |
|---|---|
| `conformance/programs/NN-name.asm` | 42 small programs covering every instruction family, data directives, addressing, labels, errors and runtime faults |
| `conformance/programs/NN-name.expected` | Final machine state produced by the **original** Java interpreter (pinned commit) |
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

The port should ship an equivalent headless runner (Node, no Angular) that prints the
same format, and a test that runs every program and compares with the expectation
(original output, patched by §3).

## 3. Port expectations that differ from the original (FIX items)

For these programs the port must produce the original `.expected` output **with the
listed changes**; everything not listed stays identical.

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
| 30-errors | Q-E-1 | `EIP=0x00000000` |
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

All other programs (01, 04-06, 08-10, 12, 14-17, 19, 22-24, 28-29, 38, 41) must match
the original output byte for byte.

## 4. Additional tests the port should add

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
