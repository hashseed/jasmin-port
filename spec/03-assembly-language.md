# 03. Assembly language

Sources: `src/jasmin/core/Parser.java`, `Op.java`, `CalculatedAddress.java`,
`Parameters.java`, `FullArgument.java`, `DataSpace.java`, `Fpu.java`.

Jasmin accepts a simplified Intel/NASM-like syntax, one instruction per line,
processed line by line. There is no section syntax, no `ORG`, no macros, no
expressions beyond the addressing forms below.

## 1. Line structure

```
[label:] [prefix] mnemonic [operand {, operand}] [; comment]
[label:]                                          [; comment]
```

Processing order for one line (`Parser.parse`):

1. **Case folding.** Everything outside single quotes is upper-cased. Text inside
   `'...'` keeps its case. `\r` and `\n` are removed.
2. **Empty line:** only spaces/tabs -> `empty`.
3. **Quote protection.** Inside quotes, space, tab, comma, backslash, `;` and `:` are
   protected so they do not act as separators. Outside quotes, each comma is padded to
   ` , ` so it becomes its own token.
4. **Comment.** From the first unprotected `;` to end of line. Its column is recorded
   for highlighting.
5. **Label.** If an unprotected `:` appears before the comment, the text before it
   (leading blanks trimmed) is the label. It must contain no space, tab or quote, and
   must not classify (§4) as anything other than an unknown word, an existing label, a
   variable or a constant. Otherwise: error `Invalid Label` (span = the label text).
   So `loop1:`, `.x:`, `1abc:` are valid; `eax:`, `10:`, `byte:`, `rep:` are not.
6. **Label-only line:** nothing but blanks/commas remain -> `labelOnly`. Such a label
   attaches to the next non-empty line (§7).
7. **Brackets.** All spaces/tabs between the first `[` and the last `]` are removed, so
   `[ ebx + 4 ]` becomes `[EBX+4]`. In the original this is greedy, so `mov [eax], [ebx]`
   collapses into one token and crashes the parser (07 Q-P-4). The port strips
   whitespace inside each bracket pair separately.
8. **Tokens.** The rest is split on spaces/tabs. Each token has number literals
   converted to decimal (§3) and is classified (§4). Token rules:
   - The first token that is not a size qualifier or comma is the mnemonic.
   - A comma must follow an operand: else `A comma must only be placed after a parameter`.
   - Two operands need a comma between them: else `You must place a comma between any
     two parameters`. Exceptions: after the FPU qualifier `TO`, and after a token that
     is itself a mnemonic (the instruction following a prefix).
   - A size qualifier (`BYTE`, `WORD`, `DWORD`, `QWORD`) applies to the next operand,
     which must be a memory operand, immediate, label or variable: else `Only an
     immediate or a memory location is allowed after a size qualifier`. An immediate or
     short string larger than the qualifier: `Operand does not match previous size
     qualifier.`
9. **Prefix.** If the mnemonic is a prefix (`REP REPE REPZ REPNE REPNZ`) and operands
   follow, the first operand becomes the mnemonic and the prefix becomes operand 0. A
   prefix appearing as the first operand: `Prefixes must be placed before the command`.
10. **Unknown mnemonic:** `Unknown command` (span = mnemonic).
11. **Label kind** is decided by the instruction (§7).
12. **At most one memory operand**, except `MOVS*`/`CMPS*`: else `Only one memory access
    allowed.`
13. Operation size and operand values are computed (§5).
14. Each operand is checked: unknown word -> `Invalid Expression`; memory operands are
    checked by §6.
15. The instruction's own `validate` runs (05).
16. `EQU` is executed immediately (constants exist at parse time).

## 2. Identifiers and reserved words

- Registers usable as operands: `EAX AX AH AL EBX BX BH BL ECX CX CH CL EDX DX DH DL
  ESI SI EDI DI ESP SP EBP BP`. `EIP` is displayed and highlighted but **cannot** be an
  operand.
- Size qualifiers: `BYTE`(1) `WORD`(2) `DWORD`(4) `QWORD`(8).
- Prefixes: `REP REPE REPZ REPNE REPNZ`.
- FPU registers: `ST0`..`ST7` (no parentheses form). FPU qualifier: `TO`.
- Mnemonics: see 05. Mnemonics are not reserved as label names (`mov:` is a valid label
  but confusing).

## 3. Number literals

Converted to decimal before classification, wherever they appear in a token (also
inside `[...]`). A literal must be delimited by start/end of token or one of
`[ ] + - * : . tab , ; ' space`. Letters are already upper-case, so suffixes and `0x`
are case-insensitive.

| Form | Pattern | Example | Value |
|---|---|---|---|
| decimal | `-?\d+` | `42`, `-7` | 42, -7 |
| hex, C style | `0X[0-9A-F]+` | `0x1F` | 31 |
| hex, suffix | `[0-9][0-9A-F]*H` (must start with a digit) | `0FFh`, `10h` | 255, 16 |
| hex, `$` prefix | `\$[0-9][0-9A-F]*` | `$1F` | broken in original (07 Q-P-1) |
| binary | `[01]+B` | `1010b` | 10 |
| octal | `[0-7]+O` or `[0-7]+Q` | `17o`, `777q` | 15, 511 |
| float | `-?[0-9]+\.[0-9]*(E[+-]?[0-9]+)?` | `1.5`, `2.`, `-1.0E3` | IEEE double/float |

A minus sign before a converted literal survives (`-0x10` -> `-16`). Integers must fit
in a signed 64-bit value, else `Invalid Expression`.

**Character constants.** `'a'`..`'abcd'` (1-4 characters, i.e. token length including
quotes <= 6) are *short strings*: the value packs the characters little-endian (first
character in the lowest byte; `'abcd'` = `0x64636261`). Their size is the character
count rounded up to 1, 2 or 4 (3 -> 4). Longer quoted text is a *string*, only valid in
data directives (05 §12). There are no escape sequences; a backslash is literal and a
quote cannot appear inside a string.

## 4. Operand classification

Checked in this order (first match wins; `Op` type in parentheses):

1. empty (`NULL`); `,` (`COMMA`)
2. `[...]` (`MU`: memory of undecided size)
3. register (`R8`/`R16`/`R32`)
4. decimal integer (`I8`/`I16`/`I32`/`I64` by minimum size, below)
5. float (`FLOAT`)
6. known variable (`VARIABLE`), 7. known constant (`CONST`), 8. label defined anywhere
   in the document (`LABEL`)
9. size qualifier (`SIZEQUALI`), 10. prefix (`PREFIX`)
11. quoted text: <= 4 chars `CHARS`, longer `STRING`
12. `ST0`..`ST7` (`FPUREG`), 13. `TO` (`FPUQUALI`)
14. anything else: `ERROR` (reported as `Invalid Expression`, or accepted as a label name)

**Minimum immediate size:** for `v >= 0`: 1 if `v <= 0xFF`, 2 if `<= 0xFFFF`, 4 if
`<= 0xFFFFFFFF`, else 8. For `v < 0`: with `m = -v - 1`: 1 if `m <= 127`, 2 if
`m <= 32767`, 4 if `m <= 2^31-1`, else 8. So `mov al, 255` and `mov al, -128` are fine;
`mov al, 256` and `mov al, -129` fail with `Operand too large, does not fit into
destination.`

## 5. Operand size and values

- Registers have their natural size; a size qualifier fixes a memory operand's or
  immediate's size; otherwise memory operands and immediates are "undecided".
- **Operation size** = max(size of operand 0, size of operand 1). If both undecided:
  the instruction's default size: 4 for most instructions; 2 for `PUSH`, `POP`, `BT*`;
  8 for FPU instructions and `CMPXCHG8B`; 1/2/4/8 for `DB`/`DW`/`DD`/`DQ` and
  `RESB`/`RESW`/`RESD`/`RESQ`.
- Undecided memory operands take the operation size. Hence `mov [eax], 5` writes a
  **dword**, `mov [eax], al` a byte, `push 5` pushes a **word**.
- Immediate values are converted at the operation size: instructions marked *signed*
  (05) keep the sign-extended value, others mask it to the operation size.
- Variables evaluate to their **address**, constants to their value, labels to their
  **line number**.

## 6. Memory operands

After whitespace removal, names of variables and constants that appear between the
delimiters `[ ] + - *` are replaced by their numeric value. Then the text inside the
brackets must match exactly one of these forms (`R` = 32-bit register, `d` = decimal
displacement, `s` = scale):

| Form | Example |
|---|---|
| `d` (may be negative) | `[100]`, `[var]` |
| `R` | `[ebx]` |
| `R+d`, `R-d` | `[ebp-4]`, `[ebx+var]` |
| `R*s`, `R*s+d`, `R*s-d` | `[esi*4+8]` |
| `R+R`, `R+R+d`, `R+R-d` (scale 1) | `[ebx+esi]` |
| `R+R*s`, `R+R*s+d`, `R+R*s-d` | `[ebx+esi*4-8]` |

Not supported: index before base (`[esi*4+ebx]`), `R-R`, displacement before a register
(`[8+ebx]`, `[var+4]`), more than one displacement, expressions like `[var+var]`.
These give `Malformed memory address` (also for a `]` that is not the last character).

Checks, in order: scale must be 1, 2, 4 or 8 (`Scale factor must be either 1, 2, 4, or
8.`); ESP cannot be an index (`ESP cannot be used as an index register.`); only 32-bit
registers (`Only 32bit registers are valid for address calculation.`); range
(`Memory address out of range`): the access `[ea, ea+size)` must lie within
`[offset, offset+memorySize)`. At parse time only register-free addresses are range
checked; addresses with registers are checked when the line executes, using current
register values.

Effective address = base + index*scale + displacement, computed with 32-bit signed
register values.

## 7. Labels, variables and constants

A line's *label* is the label written on it, or else the label of the immediately
preceding non-empty line if that line is label-only (blank lines in between are
skipped). The instruction on that line decides the label's kind:

| Instruction on the labelled line | Kind | Value when used as an operand |
|---|---|---|
| `EQU` (preprocessor) | constant | the `EQU` value |
| `DB DW DD DQ RESB RESW RESD RESQ` (pseudo) | variable | the address of the first allocated byte |
| any other instruction | label | its line number |

- `EQU` without a label: `Preprocessor commands must be preceded by a label.`
- A variable's address is provisional (the next free data address) until its directive
  executes, and then fixed (04 §5).
- Every label, including variables and constants, is also a jump target defined at its
  line; `jmp myvar` jumps to that line.
- Labels are global to the document; duplicate definition gives `Label already defined
  in line N`.
- Using a label that is not defined anywhere classifies as unknown -> `Invalid
  Expression`.

## 8. Operand-type error messages

Instructions validate operands against sets of allowed types. The message is built by
`Parameters.errorMsg` / `Op.humanNamesArray` and must be reproduced verbatim, including
the trailing space, e.g.:

- `Operand must be a register, or an 8bit, 16bit or 32bit memory location. ` (`inc [4]`)
- `Operand must be an 8bit or 16bit register, or an 8bit or 16bit memory location. ` (`movzx eax, ebx`)
- `Operand must be a 32bit or 64bit memory location, or an FPU register. ` (`fld eax`)
- `Operand must be a memory location. ` (`lea eax, ebx`)
- `Operand must be empty. ` (`nop 1`, extra operands)

Format: `Operand must be ` + names joined by `, ` with `or ` before the last + `. `.
Group names: all four register sizes -> `a register`; a subset -> e.g. `a 16bit or
32bit register`, `an 8bit, 16bit or 32bit register`; same for `memory location` and
`immediate`; then `a label`, `a size qualifier`, `a prefix`, `a short string` (or `a
string`), `an FPU register` (or `ST0`), `an FPU qualifier`, `a floating-point
constant`, `empty`. An empty set gives `Invalid operand (no description available)`.
Port `Op.humanNamesArray` line by line; its exact output for every allowed-type set used
in 05 is fixed by the conformance tests.

## 9. Error catalogue

Error span = first occurrence of the offending token in the upper-cased line, searching
from the token's position. Messages verbatim:

| Message | Typical trigger |
|---|---|
| `Invalid Label` | `eax: nop` |
| `Label already defined in line N` | second `x:` |
| `Unknown command` | `foo eax` |
| `Invalid Expression` | undefined name, malformed number |
| `A comma must only be placed after a parameter` | `mov eax, , ebx` |
| `You must place a comma between any two parameters` | `mov eax ebx` |
| `Only an immediate or a memory location is allowed after a size qualifier` | `byte eax` |
| `Operand does not match previous size qualifier.` | `mov [0], byte 300` |
| `Prefixes must be placed before the command` | `movsb rep` |
| `Preprocessor commands must be preceded by a label.` | `equ 5` |
| `Only one memory access allowed.` | `add [eax], [ebx]` once Q-P-4 is fixed; in the original every line with two `[...]` operands crashes the parser instead (07 Q-P-4) |
| `Malformed memory address` | `[var+1]`, `[esi*2+ebx]` |
| `Scale factor must be either 1, 2, 4, or 8.` | `[eax*3]` |
| `ESP cannot be used as an index register.` | `[esp*2]` |
| `Only 32bit registers are valid for address calculation.` | `[ax]` |
| `Memory address out of range` | `[5000]` with 4096 bytes |
| `Size mismatch` | `mov eax, bl` |
| `Register sizes mismatch.` | not reachable in practice (`Size mismatch` fires first) |
| `Operand too large, does not fit into destination.` | `mov al, 256` |
| `Invalid parameter. Must specify a register or a memory address as destination.` | `mov 5, eax` |
| `Invalid parameter. Must specify a register, a memory address or an immediate as operand.` | bad source |
| `First argument must be a register or memory address` | `cmpxchg 5, eax` |
| `Second argument must be a register` | `cmpxchg eax, 5` |
| `Operand must be at least N byte(s) large` | `push al` |
| `Operand must not be larger than N byte(s)` | `db 300` |
| `Only the REP prefix is allowed here` | `repe movsb` |
| `Only the REPE/REPZ/REPNE/REPNZ prefixes are allowes here` (sic) | `rep cmpsb` |
| `One of the arguments must be ST0` | `fadd st1, st2` |
| `second argument must be CL or an 8-bit immediate` | `shl eax, bl` |
| `second register must be CL or an 8-bit immediate` | `rol eax, bl` |
| `third register must be CL or an 8-bit immediate` | `shld eax, ebx, dl` |
| `invalid reservation size` | `resb 0` |
| `Operand must be ...` | per-instruction type checks (§8) |

Runtime errors (04 §9.5): `Memory address out of range` and `Memory address out of
range. Might be a stack over-/underflow.`
