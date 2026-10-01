# 04. Machine model and execution

Sources: `src/jasmin/core/DataSpace.java`, `Memory.java`, `Registers.java`,
`Parameters.java`, `JasminCommand.java`, `Fpu.java`, `Parser.java`,
`src/jasmin/gui/JasDocument.java`, `SyntaxHighlighter.java`, `MainFrame.java`.

Each document tab owns one independent machine.

## 1. Creation

When a document is created:
- `memorySize` = setting `memory` (default 4096) rounded **up** to a multiple of 4.
- `offset` = setting `offset` (default 0). Valid addresses are
  `[offset, offset + memorySize)`.
- Memory is all zero, registers zero, flags clear, FPU empty, no variables/constants.
- `ESP = EBP = offset + memorySize` (one past the last byte). `EIP = 0`.

## 2. Registers

Nine 32-bit registers: `EAX EBX ECX EDX ESI EDI ESP EBP EIP`. Aliases:

| 32-bit | 16-bit (bits 0-15) | 8-bit high (bits 8-15) | 8-bit low (bits 0-7) |
|---|---|---|---|
| EAX | AX | AH | AL |
| EBX | BX | BH | BL |
| ECX | CX | CH | CL |
| EDX | DX | DH | DL |
| ESI | SI | | |
| EDI | DI | | |
| ESP | SP | | |
| EBP | BP | | |
| EIP | (none) | | |

Writing an alias changes only its bits. Values are stored unsigned; instructions read
them unsigned or sign-extended depending on the instruction (05, column *signed*).

**EIP is a line number:** the 0-based index of the next editor line to execute. Labels
evaluate to line numbers, so `jmp label`, `call label`, `jmp 3`, `mov eax, label` /
`jmp eax` all work with line numbers. `EIP` cannot be named as an operand.

## 3. Flags

`CF OF SF ZF PF AF TF DF`, booleans, all false initially. Shown and editable in the UI
(02 §8). TF has no effect. There is no `EFLAGS` register; `PUSHF`/`POPF`/`LAHF`/`SAHF`
pack/unpack them (05 §9).

### 3.1 Standard flag computation (`JasminCommand.setFlags`)
Arithmetic instructions compute `result` from operands `a` and `b` in at least 64-bit
precision (for `SUB`/`CMP`/`SBB`/`NEG` the code sets `b := -b` and adds). With
`n = 8 * operation size`, for each flag the instruction requests:

- `ZF = (result mod 2^n) == 0`
- `SF = bit (n-1) of result`
- `PF = popcount(result & 0xFF) is even`
- `CF = bit n of result` (carry out / borrow, given unsigned `a`, `b`)
- `OF = sign(a) == sign(b) && sign(result) != sign(a)`, signs taken at bit `n-1`
- `AF = bit4(result) != (bit4(a) xor bit4(b))`

Conformance tests pin the exact results; see 07 Q-F-1 for a known `AF` inaccuracy.

## 4. Memory

- Flat little-endian byte array. Multi-byte values: lowest address = least
  significant byte.
- Any read or write touching a byte outside `[offset, offset+memorySize)` does nothing
  (reads return 0) and raises the runtime error `Memory address out of range. Might be
  a stack over-/underflow.` after the instruction completes.
- **Label-valued cells.** When `MOV` stores a label into a register or memory, or a
  data directive stores a label, the cell remembers "this holds label X". Every later
  read re-resolves X to its *current* line number (and rewrites the cell if it moved).
  `PUSH`/`POP`/`CALL` copy this marker along with the value. Effect: code pointers kept
  in registers/memory stay valid while the program text is edited. Any other write
  clears the marker.
- **Write notification.** Every byte write notifies listeners with
  `(address, newByteValue)`; the I/O devices (06) use this.

## 5. Data allocation (variables)

- A data pointer `nextFree` starts at `offset`.
- When a data directive line **executes**, it allocates from `nextFree` upward:
  - `DB`/`DW`/`DD`/`DQ`: per operand, `size` bytes (1/2/4/8); a string operand longer
    than `size` is split into `size`-byte chunks, each allocated and written; a
    trailing partial chunk is zero-padded.
  - `RESB`/`RESW`/`RESD`/`RESQ n`: `n * size` bytes, contents untouched (marked
    "changed" for highlighting).
  - The line's label (03 §7) becomes a variable whose address is the first allocated
    byte.
- Executing the same directive again allocates **new** memory (the variable moves).
- Before its directive has executed, a variable's address is the value of `nextFree` at
  the time the line was parsed.
- Allocation past the end of memory raises the out-of-range runtime error.
- Data grows up from `offset`; the stack grows down from the top. There is no
  collision check.
- Reset (§9.7) rewinds `nextFree` to `offset` and forgets all variables and constants
  (they are recreated by the re-parse that follows).

Typical program shape, which works because execution falls through the data lines:

```asm
msg:   db 'Hello', 0     ; executes first: allocates 6 bytes at offset
count: equ 5             ; constant, evaluated at parse time
       mov esi, msg      ; ESI = address of msg
```

## 6. Stack

- `push x` (2 or 4 bytes): `ESP -= size`, then write `x` at `[ESP]`.
- `pop x`: read `size` bytes at `[ESP]` into `x`, then if `ESP + size > EBP` raise the
  stack runtime error (the destination has already been written and ESP is unchanged);
  otherwise `ESP += size`. The comparison uses **EBP**, not the top of memory, so after
  `mov ebp, esp` you cannot pop above EBP (07 Q-S-1).
- `CALL target`: push EIP (4 bytes; it already points at the next line), then
  `EIP := target`. `RET`: pop 4 bytes into EIP.
- `PUSHA/PUSHAD`, `POPA/POPAD`, `PUSHF(D)`, `POPF(D)`: 05 §8-9.
- The memory table shades every row at or above ESP as stack (02 §10.2).

## 7. FPU

- Eight registers `R0..R7` holding doubles (64-bit IEEE, not 80-bit), a tag per
  register (`valid 0`, `zero 1`, `special 2` for NaN/Inf, `empty 3`), and `TOP`
  (initially 0). `ST(i)` is `R[(TOP + i) mod 8]`.
- Status flags: `C0 C1 C2 C3`, stack fault, precision, underflow, overflow,
  zero-divide, denormal, invalid. Status word bit layout: IE=1, DE=2, ZE=4, OE=8,
  UE=16, PE=32, SF=64, C0=256, C1=512, C2=1024, TOP in bits 11-13, C3=16384. No
  instruction reads or writes the status or tag word, and the UI does not show them.
- **push v:** `TOP := (TOP - 1) mod 8`; if `R[TOP]` is not empty set IE, SF and C1
  (stack overflow); store `v`, set its tag.
- **pop:** if `R[TOP]` is empty set IE and SF, clear C1 (underflow); tag it empty;
  `TOP := (TOP + 1) mod 8`; return the value. The value stays visible in the UI.
- **read ST(i):** if empty, set underflow flags; return the value. (The original
  indexes `R[TOP + (i mod 8)]` without wrapping and crashes when `TOP + i >= 8`;
  07 Q-FPU-1.)
- **write ST(i):** store and retag.
- Memory formats: `M32` float32, `M64` float64 for real loads/stores; `M16`/`M32`/`M64`
  signed integers for `FILD`/`FIST(P)`/`FIxxx`. Integer stores truncate toward zero
  (Java `(long) d`).
- Reset clears all FPU state; snapshots do **not** include the FPU (07 Q-SN-2).

## 8. "Recently changed" tracking

Used to render bold cells and register fields (02 §7.2, §10.2).

- There is a global step counter per machine. Each memory byte and register records
  the counter value at its last write; registers also record which part was written:
  `AL`-type writes mark *L*; `AH` marks *H*; `AX` marks *L, H, X*; `EAX` marks *L, H, X,
  E*.
- After a successful **Step** or **Execute current line**, and once at the end of a
  **Run**, the counter advances by one. A cell is "recently changed" when its stamp
  equals `counter - 1`, i.e. it was written during the last Step/Execute, or anywhere
  during the last Run.
- Display rules for a register row: collapsed field bold if any part is recent.
  Expanded fields: byte 0 bold if L or X recent (or E for registers without L); byte 1
  bold if H or X recent; bytes 2-3 bold if E recent.
- Edits in the UI (register fields, memory cells, flag checkboxes) do not advance the
  counter. Reset clears all stamps.

## 9. Execution

### 9.1 Program
The program is the editor text split into lines (`\n`). Line count includes a final
empty line after a trailing newline. Empty, comment-only and label-only lines execute as
no-ops but still take a step.

### 9.2 Step (F7, toolbar *Execute the next command*)
1. `ln := EIP`; `EIP := ln + 1`.
2. If `ln < lineCount`: parse line `ln` against the current machine state and execute
   it. On a parse error or runtime error, show the message in the error line (02 §6.4);
   else clear the error line and, if the line held an instruction, advance the change
   counter (no-op lines leave the bold markings as they were).
3. Refresh all panels; scroll to the execution mark.

Stepping when `EIP >= lineCount` only increments EIP.

### 9.3 Run (F5, toolbar play)
1. Ignored if already running. Editor becomes read-only; buttons switch (02 §4).
2. If the line at EIP has a breakpoint, that breakpoint is ignored once.
3. Loop while running and `EIP < lineCount`:
   - if the line at EIP has a breakpoint (and was not the skipped one): stop; EIP stays
     on the breakpoint line;
   - `ln := EIP; EIP := ln + 1`; execute line `ln`;
   - on error: show the message and stop.
4. On stop: advance the change counter once, refresh all panels, restore buttons.

Within one run each line is parsed at most once (the first time it executes) and the
parsed form is reused; this is only an optimization, the editor cannot change during a
run.

*Port note:* run in time-sliced batches (01 §2) so the UI stays responsive; I/O devices
repaint live during the run; other panels refresh when the run stops. An infinite loop
must stay pausable.

### 9.4 Execute current line (F9, toolbar)
Parses and executes the line containing the caret, independent of EIP. EIP is not
advanced; instructions that set EIP (`JMP`, `Jcc`, `LOOP`, `CALL`, `RET`) still do.
`CALL` pushes the current EIP. Then refresh and scroll to the execution mark. Errors as
in Step.

### 9.5 Errors
- **Parse errors** (03 §9) of the executed line.
- **Runtime:** `Memory address out of range` (computed address out of range when the
  line executes); `Memory address out of range. Might be a stack over-/underflow.` (any
  out-of-range access during execution, stack underflow per §6, data allocation
  overflow).
- **Java exceptions** in the original (division by zero, `BT reg`, FPU index, two
  memory operands) surface as raw `java.lang...` text or crash the parser. The port
  replaces them with the messages in 07.
- After an error during Step or Run, EIP has already moved past the failing line in the
  original (07 Q-E-1: the port leaves EIP on the failing line).

### 9.6 Refresh
"Refresh all panels" = execution mark, memory table, register rows, flag checkboxes,
FPU table, and every I/O device. Performed after Step, Execute current line, end of
Run, Stop, Reset, gutter right-click, Load Memory and Load Snapshot.

### 9.7 Reset (toolbar *Reset the memory and all registers*)
1. Clear flags; zero memory; forget variables and constants; `nextFree := offset`;
   clear the runtime error flag; zero registers then `ESP = EBP = offset + memorySize`,
   `EIP = 0`; clear the FPU; clear change stamps.
2. Clear the I/O devices (06).
3. Re-parse every line (re-creates constants, re-registers variables, refreshes
   highlighting and errors).
4. Refresh all panels; clear the error line.

Breakpoints, the program text and undo history are kept. *Port note:* Reset while
running first pauses.

### 9.8 Stop (toolbar)
Pause the run, set `EIP := 0`, refresh. Registers, memory and flags are kept.

### 9.9 Pause
Stops a run after the current instruction (a pending `JASMINSLEEP` is cut short) and
scrolls to the execution mark.

### 9.10 Snapshots
- **Take Snapshot:** store a copy of the machine (memory, label markers, registers
  including EIP, flags, variables, constants, `nextFree`) in the document. One slot per
  document; taking another replaces it.
- **Load Snapshot:** restore that copy and refresh. Enabled once a snapshot exists.
- The FPU is not part of a snapshot; change stamps are not restored.
- In the last upstream version both actions fail silently because the register file is
  not serializable (07 Q-SN-1). The port implements the intended behavior above.
- **Save Memory / Load Memory** write/read the same state to/from a file (09 §4).
