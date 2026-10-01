# Jasmin web port: specification

This folder codifies the user interface and behavior of **Jasmin** (Java Assembler
Interpreter), the x86 assembly learning simulator written by TU München students in
2006 and maintained by the chair LRR until about 2021. It is the basis for a purely
client-side TypeScript/Angular re-implementation. No implementation exists yet.

## Source of truth

| What | Where |
|---|---|
| Upstream repository | https://github.com/TUM-LRR/Jasmin (GPL-2.0) |
| Pinned commit | `9bb04d15032cebbb4379c717f39c9030f630800b` (2021-07-07, last commit) |
| Version shown in the app | 1.5.11 (2016-10-28) per `src/jasmin/gui/resources/Welcome.htm` |
| Older releases | https://sourceforge.net/projects/tum-jasmin/files/ (1.0 to 1.5.8) |

All file references in this spec (`src/jasmin/...`, `help/en/...`) are relative to
that commit. Where prose and the Java source disagree, the Java source wins, except
where [07-known-quirks.md](07-known-quirks.md) says the port deliberately deviates.

Behavior claims were checked two ways: by reading every Java file (core, all 51
command classes, all GUI classes), and by running the original interpreter headlessly
against the programs in [`conformance/`](conformance/) (see
[08-conformance.md](08-conformance.md)).

## Documents

| File | Contents |
|---|---|
| [01-architecture.md](01-architecture.md) | Original architecture and the target Angular architecture |
| [02-ui.md](02-ui.md) | Every window, panel, menu, toolbar button, shortcut and enablement rule |
| [03-assembly-language.md](03-assembly-language.md) | Source syntax: tokens, numbers, strings, labels, operands, addressing, sizes, errors |
| [04-machine-and-execution.md](04-machine-and-execution.md) | Registers, flags, memory, stack, variables, FPU, run/step/breakpoints/reset/snapshots |
| [05-instruction-set.md](05-instruction-set.md) | All supported mnemonics with operands, semantics and flags |
| [06-io-devices.md](06-io-devices.md) | Memory-mapped output modules: 7-segment, strip light, console, graphics |
| [07-known-quirks.md](07-known-quirks.md) | Bugs and oddities in the original, with the port's disposition for each |
| [08-conformance.md](08-conformance.md) | Golden test programs, expected outputs, and the reference harness |
| [09-assets-and-persistence.md](09-assets-and-persistence.md) | Help pages, images, icons, settings, file formats, licensing |

## Port principles (defaults chosen for this spec)

1. **Same UI, same mental model.** The layout, panels, controls, colors and wording
   match the Java app. The instruction pointer stays a *source line number*, memory
   stays a flat byte array starting at a configurable offset, and so on. Students who
   knew Jasmin should feel at home.
2. **Purely client-side.** No backend. Files are opened and saved through the browser,
   settings live in `localStorage`, help pages are bundled static assets.
3. **Fix crashes and clear bugs, keep intentional simplifications.** Each deviation is
   listed in [07-known-quirks.md](07-known-quirks.md) with a `FIX` or `KEEP`
   disposition. Conformance tests for `KEEP` items must match the Java output exactly;
   tests for `FIX` items carry a corrected expectation.
4. **Desktop-only affordances get web equivalents** (native file chooser, maximized
   window, right-click menus, Swing look and feel). These are called out inline as
   *Port note*.
5. **One test suite, two implementations.** The conformance programs run headlessly
   against both the original Java interpreter and the port
   ([08-conformance.md](08-conformance.md) §4). The interpreter core therefore has no
   Angular or DOM dependencies and ships a Node command-line runner.

## Open questions for the owner

These do not block implementation; the spec picks the default shown.

- **Fix vs. keep for bugs** (default: fix the ones marked `FIX`, see 07). The owner
  has decided Q-P-6, Q-F-1, Q-I-13, Q-I-14, Q-I-16 and Q-SN-2 (all fixed).
- **`.mem` snapshot format**: the Java format is a zipped Java object stream that a
  browser cannot read sensibly. Default: a new JSON format, no import of old `.mem`
  files.
- **Help language**: only English help exists upstream. Default: ship English only,
  keep the language selector with one entry.
