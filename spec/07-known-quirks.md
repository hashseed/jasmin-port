# 07. Known quirks and the port's disposition

Every item was found by reading the source and, where marked *verified*, reproduced by
running the original interpreter (08). Disposition:

- **KEEP**: the port reproduces the original behavior (it is part of how Jasmin works,
  or changing it has no teaching value). Conformance tests match the Java output.
- **FIX**: the port implements the corrected behavior described. Conformance tests for
  it carry the corrected expectation (08 §3).

These are defaults; the owner can flip any of them.

## Parser and syntax

| ID | Original behavior | Disposition |
|---|---|---|
| Q-P-1 | `$`-prefixed hex (`$1F`) is meant to work but the converter uses the literal as a regex, so it never converts and the operand is `Invalid Expression`. *Verified.* | **FIX**: `$1F` = 31 (must start with a digit after `$`). |
| Q-P-2 | Variables/constants are substituted only between `[ ] + - *`, and the address grammar needs registers first, so `[var+4]`, `[4+ebx]`, `[var+var]` are `Malformed memory address`. `[ebx+var]` works. *Verified.* | **KEEP** (documented limitation). Candidate enhancement later. |
| Q-P-3 | `MOV`/`CMOVcc` ignore a third operand (`mov eax, [ebx], ecx` is accepted). *Verified.* | **FIX**: `Operand must be empty. ` on the third operand. |
| Q-P-4 | Whitespace removal inside brackets is greedy from the first `[` to the last `]`; any line with two bracketed operands (`mov [eax], [ebx]`, `movs byte [edi], [esi]`) becomes one token and the parser throws a NullPointerException (the editor line simply stays unparsed). A stray `]]` does the same. *Verified.* | **FIX**: process each bracket pair separately; then two memory operands give `Only one memory access allowed.`, except bare `MOVS`/`CMPS` which accept them; malformed brackets give `Malformed memory address`. |
| Q-P-5 | `EIP` is not an operand (`mov eax, eip` is `Invalid Expression`). | **KEEP**. |
| Q-P-6 | Message typos: `...prefixes are allowes here`; Configuration page `Start adress of the useable memory:`. | **FIX** (owner decision): `Only the REPE/REPZ/REPNE/REPNZ prefixes are allowed here`; `Start address of the usable memory:`. |

## Flags

| ID | Original behavior | Disposition |
|---|---|---|
| Q-F-1 | `AF` uses `bit4(result) != bit4(a) xor bit4(b)` with `b` already negated for subtraction (the source comment admits it fails for `MOV AL,80h; SUB AL,18h`). The formula is right for additions but wrong for every subtraction whose subtrahend has a non-zero low nibble, and always wrong for `DEC`: `mov al, 0x10 / dec al` gives AF=0. *Verified.* | **FIX** (owner decision): `AF = bit4(a xor b xor result)` with the original operands, i.e. the carry/borrow out of bit 3 as on x86 (04 §3.1). Affects `SUB SBB CMP DEC NEG CMPS SCAS CMPXCHG`; `ADD ADC INC XADD` are unchanged. Verified by running the original with this formula patched in: only AF changes (08 §3). |

## Instructions

| ID | Original behavior | Disposition |
|---|---|---|
| Q-I-1 | 32-bit `IDIV` builds `EDX:EAX` from *sign-extended* halves, so a negative dividend gives garbage: `mov eax,-7 / cdq / mov ebx,2 / idiv ebx` yields `EAX=0x7FFFFFFD`. The 16-bit form has the same flaw when AX has bit 15 set (`DX=0, AX=0x8000` divides -32768). 8-bit is correct. *Verified.* | **FIX**: `EAX=0xFFFFFFFD (-3)`, `EDX=0xFFFFFFFF (-1)`; the 16-bit dividend is `DX:AX` with AX read unsigned. |
| Q-I-2 | `IMUL` sets `CF = OF = (upper half != 0)`, so a small negative product (e.g. `-1 * 2`) sets both. *Verified.* | **FIX**: `CF = OF = 1` iff the full product differs from the sign-extended truncated result. |
| Q-I-3 | `DIV`/`IDIV` by zero throws a Java `ArithmeticException` (message `java.lang.ArithmeticException: / by zero` or `BigInteger divide by zero`) which stops the run. A quotient that does not fit is silently truncated. *Verified.* | **FIX**: runtime errors `Division by zero` and `Division overflow` (no registers changed), handled like other runtime errors. |
| Q-I-4 | `CMPXCHG` when not equal writes the *negated* destination into the accumulator (`EAX=1, ESI=6` -> `EAX=0xFFFFFFFA`). *Verified.* | **FIX**: accumulator := destination. |
| Q-I-5 | `BT`/`BTS`/`BTR`/`BTC` with a register destination throw a NullPointerException (register handle lost in a clone). Memory destinations work. *Verified.* | **FIX**: register forms work as specified in 05 §3. |
| Q-I-6 | `MOVZX`/`MOVSX` validate the source only when the *source* is a 32-bit register (typo `type(1)` for `type(0)`); `movzx eax, [x]` is accepted and reads 4 bytes. | **FIX**: dest `r32` requires `r8/r16/m8/m16`; undecided memory is an error (`Operand must be an 8bit or 16bit register, or an 8bit or 16bit memory location. `). |
| Q-I-7 | Shift counts are not masked (`shl eax, 40` shifts by 40 in 64-bit arithmetic). | **FIX**: count := count & 31 for SHL/SAL/SHR/SAR (x86 semantics). |
| Q-I-8 | `SHR`/`SAR` set `CF` from bit `count-1` only when `count < n/2`; otherwise `CF = (value < 0)`, which is always 0 for `SHR`. | **FIX**: CF = last bit shifted out (0 if count > n for SHR). |
| Q-I-9 | 32-bit `SHRD` shifts the destination right but fills from its own sign instead of from the source: `shrd 0x12345678, 0x9ABCDEF0, 8` gives `0x00123456`. 16-bit is correct. *Verified.* | **FIX**: `0xF0123456`. |
| Q-I-10 | `AAM`/`AAD` call `setFlags(PF & SF & ZF)` (bitwise AND = 0), so no flags change. | **FIX**: set SF, ZF, PF from AL. |
| Q-I-11 | `SETcc` validates operand 1 instead of 0, so every `SETcc` fails with `Operand must be an 8bit register, or an 8bit memory location. ` Only 22 of the 30 forms are registered (`SETE`, `SETB`, `SETC`, `SETAE`, `SETBE`, `SETNA`, `SETNAE`, `SETNB` are `Unknown command`). *Verified.* | **FIX**: all 30 `SETcc` forms (same cc list as `CMOVcc`), operand `r8/m8`. |
| Q-I-12 | `INT` is commented out (`Unknown command`) although `INT.htm` describes a DOS `INT 21h/AH=0Ah` line input. | **KEEP** (unknown command). Optional later feature. |
| Q-I-13 | `PUSH`/`POP` default to 2 bytes: `push 5` and `push [x]` push a word, `pop [x]` pops a word, and `push 100000` silently pushes only the low word (`0x86A0`). *Verified.* | **FIX** (owner decision): x86 32-bit behavior, default operand size 4 for `PUSH` and `POP` (immediates and memory without a size qualifier). `push word 5` and 16-bit registers still push 2 bytes; `push byte 5` stays an error. |
| Q-I-14 | `LOOP*` always decrement ECX, but the help pages say CX. | **KEEP** the ECX behavior; **FIX** the help pages `LOOP`, `LOOPE`, `LOOPZ`, `LOOPNE`, `LOOPNZ` to say ECX (09 §1.1). |
| Q-I-15 | `POPF`/`POPFD` on an "empty" stack do nothing, without an error. | **KEEP**. |
| Q-I-16 | `CMOVcc` accepts everything `MOV` accepts, including immediates and 8-bit operands (`cmove al, 5`). On real x86, `CMOVcc` takes a 16- or 32-bit register destination and a same-size register or memory source; immediates and 8-bit operands are invalid. | **FIX** (owner decision): destination must be `r16/r32`, else `Operand must be a 16bit or 32bit register. `; source must be `r16/r32/m16/m32` (undecided memory takes the destination size), else `Operand must be a 16bit or 32bit register, or a 16bit or 32bit memory location. `; different sizes give `Size mismatch`. A third operand gives `Operand must be empty. ` (Q-P-3). |
| Q-I-17 | `SHLD`/`SHRD` compare the count operand to `CL` with `FullArgument.equals(Address)`, which is always false, so `shld eax, ebx, cl` is rejected (`Operand must be ...`) although the help page allows CL. | **FIX**: accept `CL` as the count (compared by register identity, as `SHR`/`RCL` do). |

## Stack and errors

| ID | Original behavior | Disposition |
|---|---|---|
| Q-S-1 | `POP` raises the stack error when `ESP + size > EBP` (after writing the destination). After `mov ebp, esp` you cannot pop values pushed before. *Verified* (`push 1 / push 2 / mov ebp, esp / pop eax` fails). | **FIX**: bound by the top of memory (`offset + memorySize`) instead of EBP; error raised before writing. Same for `RET`, `POPA(D)`, `POPF(D)`. |
| Q-E-1 | On a parse or runtime error during Step or Run, EIP already points to the next line, so the green mark is one line past the culprit. | **FIX**: leave EIP on the failing line (the green mark shows it). Machine state changes made by a partially executed instruction stay. |
| Q-E-2 | Steps past the end keep incrementing EIP. | **KEEP**. |

## FPU and snapshots

| ID | Original behavior | Disposition |
|---|---|---|
| Q-FPU-1 | Reading `ST(i)` indexes `R[TOP + (i mod 8)]` without wrap-around: ArrayIndexOutOfBounds when `TOP + i >= 8` (e.g. one value pushed, then `fadd st0, st1`). *Verified.* | **FIX**: `R[(TOP + i) mod 8]`. |
| Q-SN-1 | Take/Load Snapshot and Save/Load Memory fail silently: the register file class is not `Serializable`, so writing throws `NotSerializableException`, which is swallowed. *Verified.* | **FIX**: implement as specified in 04 §9.10 and 09 §4. |
| Q-SN-2 | Snapshots and memory files exclude the FPU. | **FIX** (owner decision): include `R0..R7`, tags, `TOP` and the FPU status flags (04 §9.10, 09 §4.3). |

## UI

| ID | Original behavior | Disposition |
|---|---|---|
| Q-UI-1 | While running, the Stop button and the Pause menu item (Ctrl+P) are disabled; only the toolbar Run/Pause toggle pauses. | **FIX**: Stop and Pause enabled while running. |
| Q-UI-2 | Breakpoints are tied to gutter row indices; inserting or deleting lines leaves them on the old index. | **FIX**: breakpoints move with their line; a deleted line drops its breakpoint. |
| Q-UI-3 | Register expand button reads `>` collapsed, `>` after expanding, `^` after collapsing. | **FIX**: `▸` / `▾`. |
| Q-UI-4 | Help *Forward* removes the wrong history index (can throw). | **FIX**: standard back/forward stacks. |
| Q-UI-5 | No unsaved-changes prompts on close or exit. | **FIX** minimally: browser `beforeunload` prompt only. |
| Q-UI-6 | The Configuration page lists all system fonts (slow). | Port offers a fixed font list (02 §12.2). |
