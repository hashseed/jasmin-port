# 05. Instruction set

Sources: `src/jasmin/commands/*.java` (one class per row group below),
`src/jasmin/core/JasminCommand.java` (`setFlags`, `testCC`), `Parameters.java`
(shared validators), `help/en/*.htm` (user-facing descriptions).

Notation: `r8/r16/r32` registers, `m8/m16/m32/m64` sized memory, `m` memory of any
size including undecided (`MU`), `imm` immediate, `n` = operation size in bits,
`acc` = AL/AX/EAX by size. "Flags: std(...)" means the standard computation of 04 §3.1
for the listed flags; flags not listed are unchanged. *Signed* = operands are read
sign-extended. *Default* = operation size when no operand fixes it (03 §5).

Quirk IDs (`Q-...`) refer to [07-known-quirks.md](07-known-quirks.md).

## 1. Data movement

| Mnemonics | Operands | Semantics | Flags | Notes |
|---|---|---|---|---|
| `MOV` | dest r/m; src r/m/imm/short string/variable/label/constant | dest := src | none | src size must not exceed dest (`Operand too large...`); register sizes must match (`Size mismatch`). Storing a label marks the cell (04 §4). A third operand is silently accepted. |
| `CMOVcc` (cc from §11, 30 forms: `CMOVA CMOVAE CMOVB CMOVBE CMOVC CMOVE CMOVG CMOVGE CMOVL CMOVLE CMOVNA CMOVNAE CMOVNB CMOVNBE CMOVNC CMOVNE CMOVNG CMOVNGE CMOVNL CMOVNLE CMOVNO CMOVNP CMOVNS CMOVNZ CMOVO CMOVP CMOVPE CMOVPO CMOVS CMOVZ`) | same as MOV | if cc: dest := src | none | Accepts immediates and 8-bit, unlike real x86 (KEEP). |
| `XCHG` | (m, r) or (r, r/m), equal sizes | swap | none | |
| `MOVZX` | r16 <- r8/m8; r32 <- r8/r16/m8/m16 | zero-extend | none | Q-I-6 (validation gap) |
| `MOVSX` | as MOVZX | sign-extend | none | *signed*. Q-I-6 |
| `LEA` | r, m | dest := effective address | none | no memory access |
| `BSWAP` | r32 | reverse byte order | none | |
| `CBW` | none | AX := sext(AL) | none | *signed* |
| `CWDE` | none | EAX := sext(AX) | none | *signed* |
| `CWD` | none | DX := high 16 bits of sext(AX) | none | *signed* |
| `CDQ` | none | EDX := high 32 bits of sext(EAX) | none | *signed* |

## 2. Integer arithmetic

| Mnemonics | Operands | Semantics | Flags | Notes |
|---|---|---|---|---|
| `ADD` | dest r/m; src as MOV | dest += src | std(OF SF ZF AF CF PF) | |
| `ADC` | same | dest += src + CF | std(all six) | |
| `SUB` | same | dest -= src | std(all six) | computed as a + (-b) |
| `SBB` | same | dest -= src + CF | std(all six) | |
| `CMP` | same | flags of dest - src | std(all six) | dest unchanged |
| `INC` / `DEC` | r, m8, m16, m32 (not undecided `[x]`; write `inc dword [x]`) | +1 / -1 | std(OF SF ZF AF PF); CF kept | |
| `NEG` | same as INC | dest := 0 - dest | std(OF SF ZF AF PF); CF := result != 0 | |
| `NOT` | same as INC | dest := ~dest | none | |
| `MUL` | r/m | n=8: AX := AL*src; 16: DX:AX := AX*src; 32: EDX:EAX := EAX*src | CF = OF = (upper half != 0) | unsigned |
| `IMUL` (1 op) | r/m | as MUL, signed | CF = OF = (upper half != 0) | *signed*. Q-I-2 |
| `IMUL` (2 ops) | r, r/m/imm/const | dest := dest * src (truncated) | CF = OF = (bits n..2n-1 of product != 0) | Q-I-2 |
| `IMUL` (3 ops) | r, r/m, imm/const (consistent sizes) | dest := src * imm | as 2 ops | Q-I-2 |
| `DIV` | r/m | n=8: AL := AX / src, AH := AX mod src; 16: DX:AX; 32: EDX:EAX | none | unsigned. Division by zero and quotient overflow: Q-I-3 |
| `IDIV` | r/m | as DIV, signed (truncating division, remainder has the dividend's sign) | none | Q-I-1 (32-bit negative dividend), Q-I-3 |
| `XADD` | dest r/m, src r | t := dest + src; src := dest; dest := t | std(all six) | |
| `CMPXCHG` | dest r/m, src r | compare acc with dest (flags of acc - dest); if equal dest := src else acc := dest | std(all six) | Q-I-4 |
| `CMPXCHG8B` | m64 | if EDX:EAX == m64 then ZF := 1, m64 := ECX:EBX else ZF := 0, EDX:EAX := m64 | ZF | default 8 |

## 3. Logic and bit operations

| Mnemonics | Operands | Semantics | Flags | Notes |
|---|---|---|---|---|
| `AND` `OR` `XOR` | as ADD | bitwise | std(SF ZF PF); OF := 0; CF := 0 | AF kept |
| `TEST` | as ADD | flags of dest AND src | as AND | dest unchanged |
| `BT` `BTS` `BTR` `BTC` | dest r16/r32/m16/m32/m; bit offset r16/r32/imm8 | CF := bit; then set/reset/complement it | CF | default 2. Register offset mod n. Memory: byte address += offset/8, bit = offset mod 8 (offset may reach beyond the operand). Register dest crashes in original: Q-I-5 |
| `BSF` / `BSR` | dest r16/r32; src r16/r32/m16/m32/m | ZF := (src == 0); if src != 0, dest := index of lowest / highest set bit | ZF | |

## 4. Shifts and rotates

Count operand: `CL` or an 8-bit immediate; any other register gives `second argument
must be CL or an 8-bit immediate` (shifts) / `second register must be CL...` (rotates).

| Mnemonics | Operands | Semantics | Flags | Notes |
|---|---|---|---|---|
| `SHL` / `SAL` | r8/r16/r32/m8/m16/m32/m, count | dest <<= count | count 0: none. Else std(CF SF ZF PF) (CF = last bit out); if count == 1: OF := CF != MSB(result) | Count is not masked to 5 bits: Q-I-7 |
| `SHR` | same | logical right shift | OF := MSB(original) if count == 1; std(SF ZF PF); CF: Q-I-8 | |
| `SAR` | same | arithmetic right shift (*signed* read) | OF := 0 if count == 1; std(SF ZF PF); CF: Q-I-8 | |
| `ROL` / `ROR` | r, m8, m16, m32; count | rotate by count mod n | CF := last bit rotated; OF only if count == 1 (ROL: CF xor MSB; ROR: xor of two top bits) | count 0: no-op |
| `RCL` / `RCR` | same | rotate through CF by count mod (n+1) | as ROL/ROR | |
| `SHLD` | dest r16/r32/m16/m32/m; src r16/r32; count CL/imm8 | dest := high n bits of (dest:src) << count | if count == 0 or count >= n: no-op. CF := last bit out; std(SF ZF PF); OF if count == 1 (MSB changed) | |
| `SHRD` | same | dest := low n bits of (src:dest) >> count | same | 32-bit form wrong in original: Q-I-9 |

## 5. Control flow

| Mnemonics | Operands | Semantics | Notes |
|---|---|---|---|
| `JMP` | label, r, m, imm, constant | EIP := target line | `jmp 3` jumps to line 3 |
| `Jcc`: `JA JAE JB JBE JC JE JG JGE JL JLE JNA JNAE JNB JNBE JNC JNE JNG JNGE JNL JNLE JNO JNP JNS JNZ JO JP JPE JPO JS JZ` | as JMP | if cc (§11): EIP := target | |
| `JCXZ` / `JECXZ` | as JMP | if CX == 0 / ECX == 0: EIP := target | |
| `LOOP` | as JMP | ECX := ECX - 1; if ECX != 0: EIP := target | always ECX (help text says CX); flags kept |
| `LOOPE` `LOOPZ` / `LOOPNE` `LOOPNZ` | as JMP | ECX -= 1; jump if ECX != 0 and ZF / !ZF | |
| `CALL` | label, r, m, imm (not constant) | push EIP (4 bytes); EIP := target | |
| `RET` | none | pop 4 bytes into EIP | no `RET imm16` |

A target beyond the last line simply ends the program on the next step/run iteration.

## 6. Stack

| Mnemonics | Operands | Semantics | Notes |
|---|---|---|---|
| `PUSH` | r16/r32, m16/m32, imm, label, variable, constant; size 2-4 | ESP -= size; [ESP] := value | default 2: `push 5` pushes a **word**; use `push dword 5`. `push al`: `Operand must be at least 2 bytes large` |
| `POP` | r16/r32, m16/m32; size 2-4 | value := [ESP]; check vs EBP (04 §6); ESP += size | |
| `PUSHA` | none | push AX, CX, DX, BX, original SP, BP, SI, DI (16-bit each) | |
| `POPA` | none | pop DI, SI, BP, (skip SP: popped into BX then overwritten), BX, DX, CX, AX | |
| `PUSHAD` / `POPAD` | none | 32-bit versions | |

## 7. Flag instructions

| Mnemonics | Semantics |
|---|---|
| `CLC` `STC` `CMC` | CF := 0 / 1 / !CF |
| `CLD` `STD` | DF := 0 / 1 |
| `PUSHF` / `PUSHFD` | push 2 / 4 bytes: bit1 = 1, CF bit0, PF bit2, AF bit4, ZF bit6, SF bit7, TF bit8, DF bit10, OF bit11 |
| `POPF` / `POPFD` | if ESP + size > EBP: do nothing (no error); else pop and set CF PF AF ZF SF TF DF OF from those bits |
| `LAHF` | AH := low byte of the PUSHF word |
| `SAHF` | CF PF AF ZF SF from AH bits 0, 2, 4, 6, 7 |

## 8. String instructions

Forms: `LODSB LODSW LODSD STOSB STOSW STOSD SCASB SCASW SCASD MOVSB MOVSW MOVSD CMPSB
CMPSW CMPSD` (no operands; size from suffix) and the bare `LODS STOS SCAS MOVS CMPS`
with memory operand(s) giving the size (`lods byte [esi]`). Bare `MOVS`/`CMPS` take two
memory operands of the same type, which crashes the original parser (Q-P-4).

Addresses are the full 32-bit ESI/EDI. After each element, ESI/EDI move by the size,
up if DF = 0, down if DF = 1.

| Op | Semantics | Flags |
|---|---|---|
| `LODS` | acc := [ESI]; ESI ± size | none |
| `STOS` | [EDI] := acc; EDI ± size | none |
| `MOVS` | [EDI] := [ESI]; both ± size | none |
| `SCAS` | flags of acc - [EDI]; EDI ± size | std(all six) |
| `CMPS` | flags of [ESI] - [EDI]; both ± size | std(all six) |

Prefixes: `REP` only with MOVS/LODS/STOS (else `Only the REP prefix is allowed here`);
`REPE REPZ REPNE REPNZ` only with CMPS/SCAS (else `Only the REPE/REPZ/REPNE/REPNZ
prefixes are allowes here`). With a prefix: if ECX == 0 nothing happens; else repeat
{ element; ECX -= 1 } while ECX != 0 and (prefix is REP, or ZF == 1 for REPE/REPZ, ZF
== 0 for REPNE/REPNZ).

## 9. BCD adjust

All operate on AL/AH, no operands.

| Mnemonic | Semantics (as implemented) |
|---|---|
| `AAA` | `t := AL & 0xF; CF := AF := (t > 9 or AF)`; if CF: `AL := (t + 6) & 0xF; AH += 1` else `AL := t` |
| `AAS` | same with `AL := (t - 6) & 0xF; AH -= 1` |
| `DAA` | `oldCF := CF; AF := AF or (AL & 0xF) > 9`; if AF: `AL += 6`; `CF := AL_original > 0x99 or oldCF`; if CF: `AL += 0x60` |
| `DAS` | as DAA with subtraction |
| `AAM` | `AH := AL / 10; AL := AL mod 10` (base 10 only; flags not updated, Q-I-10) |
| `AAD` | `AL := AL + 10*AH; AH := 0` (base 10 only; flags not updated, Q-I-10) |

## 10. Miscellaneous

| Mnemonic | Operands | Semantics |
|---|---|---|
| `NOP`, `FNOP` | none | nothing |
| `JASMINSLEEP` | imm, r, m, variable, constant | pause execution for that many milliseconds (Jasmin-only; help page warns it is not a real instruction) |
| `SETcc` | r8/m8 | intended: dest := cc ? 1 : 0. Broken in original (Q-I-11); port implements all SETcc forms |
| `INT` | | not implemented: `Unknown command` although `help/en/INT.htm` exists (Q-I-12) |

## 11. Condition codes (`testCC`)

| cc | Condition |
|---|---|
| O / NO | OF / !OF |
| C, B, NAE / NC, NB, AE | CF / !CF |
| E, Z / NE, NZ | ZF / !ZF |
| BE, NA / A, NBE | CF or ZF / !(CF or ZF) |
| S / NS | SF / !SF |
| P, PE / NP, PO | PF / !PF |
| L, NGE / GE, NL | SF != OF / SF == OF |
| LE, NG / G, NLE | (SF != OF) or ZF / !((SF != OF) or ZF) |
| CXZ / ECXZ | CX == 0 / ECX == 0 |

## 12. Pseudo-instructions

| Mnemonics | Operands | Semantics |
|---|---|---|
| `DB` `DW` `DD` | one or more of: imm, short string, string, label, constant (`DD` also float) | allocate and store each operand at size 1/2/4 (04 §5). Floats in `DD` are float32. Labels store their line number (and mark the cell). Size check: `Operand must not be larger than N byte(s)` |
| `DQ` | float or label | allocate 8 bytes each, float64 |
| `RESB` `RESW` `RESD` `RESQ` | imm or constant `k` | allocate `k * size` bytes; `k*size` must be 1..memorySize else `invalid reservation size` |
| `EQU` | imm | at parse time, the line's label becomes a constant with that value; requires a label |

Data operands with no operands at all are accepted (allocate nothing).

## 13. FPU

Default operation size 8; operands read *signed*. `STi` means `ST0`..`ST7`.

| Mnemonics | Operands | Semantics |
|---|---|---|
| `FLD` | m32, m64, STi | push value |
| `FST` / `FSTP` | m32, m64, STi | dest := ST0; FSTP then pops |
| `FILD` | m16, m32, m64 | push integer |
| `FIST` | m16, m32 (default 4) | dest := trunc(ST0) |
| `FISTP` | m16, m32, m64 | dest := trunc(ST0); pop |
| `FADD FSUB FSUBR FMUL FDIV FDIVR` | none: `ST1 := ST1 op ST0` (no pop). `m32/m64` or one `STi`: `ST0 := ST0 op x`. `STi, STj` (one must be ST0): `STi := STi op STj`. `TO STi`: `STi := STi op ST0` | `op` for SUBR/DIVR is reversed (`x op y` = `y - x`, `y / x`) |
| `FADDP FSUBP FSUBRP FMULP FDIVP FDIVRP` | none: `ST1 := ST1 op ST0`, pop. `STi` or `STi, ST0`: `STi := STi op ST0`, pop | |
| `FIADD FISUB FISUBR FIMUL FIDIV FIDIVR` | m16, m32 | `ST0 := ST0 op int(m)` |
| `FABS` `FCHS` | none | ST0 := abs(ST0) / -ST0 |
| `FSIN` `FCOS` `FSQRT` | none | ST0 := sin / cos / sqrt (radians) |
| `FSINCOS` | none | t := ST0; ST0 := sin t; push cos t |
| `FLD1 FLDZ FLDPI FLDL2E FLDL2T FLDLG2 FLDLN2` | none | push 1, 0, pi, log2 e, log2 10, log10 2, ln 2 |

No FPU compare, control-word or status-word instructions exist. Several FPU mnemonics
(`FSIN`, `FLD1`, `FABS`...) have no help page.

## 14. Help coverage

230 mnemonics are implemented; `help/en/` has 199 pages. Help without implementation:
`INT`. Implemented without help (the pane shows `No help found for X`): `FABS FCHS
FCOS FDIV FDIVP FDIVR FDIVRP FIDIV FIDIVR FIMUL FISUB FISUBR FLD FLD1 FLDL2E FLDL2T
FLDLG2 FLDLN2 FLDPI FLDZ FMUL FMULP FNOP FSIN FSINCOS FSQRT FST FSTP FSUB FSUBP FSUBR
FSUBRP`. The port ships the pages as-is (09 §1); writing the missing FPU pages is
optional. When the port adds the missing `SETcc` forms (Q-I-11), their help pages are
also missing.

The complete list of implemented mnemonics (from the `getID()` methods):
[`conformance/mnemonics.txt`](conformance/mnemonics.txt).
