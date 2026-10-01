# 01. Architecture

## 1. Original (Java/Swing)

```
jasmin.Main                      entry point, creates MainFrame (Swing, system look and feel)
jasmin.gui.MainFrame             top-level window: menu bar, toolbar, tabbed pane of documents/help pages
jasmin.gui.JasDocument           one open program: editor + registers + flags + FPU + memory + help + I/O modules
jasmin.gui.SyntaxHighlighter     the editor's StyledDocument: incremental per-line parsing, label tracking, highlighting
jasmin.gui.LineNumber            one gutter row: line number label + breakpoint toggle
jasmin.gui.RegisterPanel         one general-purpose register row (EAX..EIP)
jasmin.gui.MemoryTableModel/Renderer   memory table
jasmin.gui.FpuPanel/FpuStackTableModel FPU register table
jasmin.gui.HelpBrowser           HTML viewer used for the Welcome/Configuration tabs and the context-help pane
jasmin.gui.{SevenSegment,StripLight,Console,VGA}   I/O modules (IGuiModule)
jasmin.core.Parser               parses one source line into a ParseResult (command object + Parameters)
jasmin.core.DataSpace            machine state: memory, registers, flags, variables, constants, FPU
jasmin.core.Memory / Registers   byte storage and register file, with "dirty" (recently changed) tracking
jasmin.core.CalculatedAddress    effective-address parsing/evaluation for [..] operands
jasmin.core.Parameters / FullArgument / Address   typed operands handed to commands
jasmin.core.Op                   operand-type bit flags and human-readable names for error messages
jasmin.core.JasminCommand        base class of every instruction; flag helpers; condition-code test
jasmin.core.CommandLoader        reflection: loads every class in jasmin.commands, maps mnemonic -> command
jasmin.core.HelpLoader           loads help/<lang>/<MNEMONIC>.htm into a map
jasmin.core.Fpu                  x87 stack of 8 doubles with tags and status word
jasmin.commands.*                50 command classes covering ~230 mnemonics (see 05)
```

Key design facts the port must preserve:

- **Line-oriented interpreter, not an assembler.** There is no machine code. Each
  source line is parsed to a command object and executed directly. `EIP` holds the
  0-based index of the *next source line* to execute. Jump/call targets are line
  numbers (labels resolve to the line that defines them).
- **One machine per document.** Every open program tab owns its own `DataSpace`,
  `Parser`, command table and I/O modules. Tabs do not share state.
- **Live parsing.** Every edit re-parses the affected lines immediately; errors are
  underlined in red and the message for the caret's line appears below the editor.
- **Pseudo-instructions execute at run time.** `DB`/`DW`/`DD`/`DQ`/`RESx` allocate
  memory when the line is *executed*, not at load. `EQU` is evaluated at *parse* time.
- **Execution runs on a worker thread** in the Java app; the UI refreshes once the run
  stops, while I/O modules repaint live through memory-change listeners.

## 2. Target (TypeScript/Angular, client-only)

Recommended structure. Names are suggestions; behavior is what the other documents
specify.

```
src/app/
  core/                         pure TypeScript, no Angular imports, unit-testable in Node
    op-types.ts                 Op bit flags + humanName/humanNamesArray (03 §8)
    number-literals.ts          hex2dec equivalent (03 §3)
    parser.ts                   line parser -> ParseResult (03)
    address.ts                  effective-address grammar/evaluator (03 §6)
    data-space.ts               memory, registers, flags, variables, constants, dirty tracking (04)
    fpu.ts                      x87 model (04 §7)
    commands/                   one module per Java command class, registered in a static table
    program.ts                  per-document line model: ParseResults, label definitions/uses, error lines
    interpreter.ts              step/run/execute-line/stop/reset/breakpoints/snapshots (04 §9)
  ui/
    shell/                      menu bar, toolbar, tab strip, status line (02 §2-4)
    document/                   document view with split panes (02 §5)
    editor/                     code editor + gutter (CodeMirror 6 recommended) (02 §6)
    registers/                  register rows, format toggles, flag checkboxes (02 §7-8)
    fpu/                        FPU table (02 §9)
    memory/                     virtualized memory table (02 §10)
    help/                       context help pane and Welcome/Configuration pages (02 §11-12)
    devices/                    7-segment, strip light, console, graphics canvases (06)
  services/
    settings.service.ts         localStorage-backed properties (09 §3)
    file.service.ts             open/save .asm, save/load memory (09 §4)
    help.service.ts             bundled help pages by mnemonic (09 §1)
```

### Arithmetic

The Java code relies on 64-bit `long` arithmetic (e.g. carry is bit `size*8` of a
64-bit sum, `MUL r/m32` forms a 64-bit product). JavaScript numbers are only exact to
2^53. Use `BigInt` for the operations that need more than 53 bits (32-bit `MUL`/`IMUL`
products, `DIV`/`IDIV` with `EDX:EAX`, `CMPXCHG8B`, `DQ`/64-bit memory, `SHLD`/`SHRD`
32-bit buffers), or a 64-bit helper. All register and memory values otherwise fit in
`number` as unsigned 32-bit (`>>> 0`).

Doubles for the FPU map directly to JS `number`; `Double.doubleToRawLongBits` maps to a
`DataView` round-trip.

### Execution without threads

The browser has one UI thread. Implement **Run** as a cooperative loop that executes a
batch of lines per slice (time-boxed, e.g. ~8 ms) and yields with
`setTimeout(0)`/`requestAnimationFrame`, so Pause, Stop and live device repaints work.
`JASMINSLEEP n` suspends the loop for `n` ms with a timer (Pause cancels the timer).
A Web Worker is an alternative but complicates live device updates and breakpoints;
the cooperative loop is the recommended default.

### Change notification

Replace Java listeners with a per-document event stream (RxJS `Subject` or Angular
signals): byte-level memory writes (for devices), register/flag/FPU changes, and
"execution stopped". Panels other than devices refresh after each Step and when Run
stops, like the original (see 04 §9.6); devices refresh live.
