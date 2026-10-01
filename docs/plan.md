# Implementation plan

How we build the TypeScript/Angular port of Jasmin described in [`spec/`](../spec/README.md).
The spec says *what* the app does; this document says *in what order* we build it, with
which tools, and how it should *look*. Where this plan and the spec disagree on
behavior, the spec wins; where they disagree on appearance, this plan wins (see
"Visual direction" and "Spec updates" below).

## Goals and non-goals

- **Same layout, same mental model.** Every panel, toolbar button, menu item, shortcut,
  enablement rule and wording from [02-ui.md](../spec/02-ui.md) is kept, in the same
  place. A student who used Jasmin finds everything where it was.
- **Modern look.** No Swing chrome: no bevels, no grey-on-grey, no 2000s PNG icons,
  no system-font tables. Flat surfaces, consistent spacing, crisp vector icons, good
  typography, a real dark mode.
- **Purely client-side.** A static build that works offline once loaded.
- **One test suite, two implementations.** `bash spec/conformance/run-conformance.sh ts`
  passes for all 44 programs, using a Node runner that imports only the interpreter
  core.
- Non-goals for v1: other help languages, importing Java `.mem` files, mobile or touch
  layouts (minimum 800x600, as in the spec), collaborative or cloud features.

## Technology choices

| Concern | Choice | Why |
|---|---|---|
| Framework | Angular (current stable, v20+), standalone components, **signals**, zoneless change detection | Modern Angular idioms; signals fit "refresh after step" without zone.js overhead |
| Language | TypeScript, `strict` on | |
| Editor | **CodeMirror 6** | Gutter markers, decorations from our own parse results, undo history, keymaps, read-only toggling (spec 02 §6) |
| Layout primitives | **Angular CDK** (virtual scroll, overlay for menus and dialogs, a11y, drag for split dividers) | Behavior without a visual opinion, so the look is ours. Angular Material is deliberately not used: its look is recognisably "Google", and we need tight, dense panels |
| Icons | **Lucide** (ISC license), inlined as SVG | Consistent 1.5px stroke set covering every toolbar action (see icon mapping below) |
| Fonts | **Inter** (UI) and **JetBrains Mono** (editor, registers, memory), both OFL, self-hosted | Tabular figures for numbers; no runtime font fetches |
| Unit tests | **Vitest** for `core/` and services | Fast, runs `core/` in plain Node |
| UI/E2E tests | **Playwright** (Chromium is preinstalled in our cloud sessions) | Enablement rules, shortcuts, file flows, screenshot checks |
| Headless runner | `src/headless/run.ts`, bundled with **esbuild** to `dist/headless/run.js` | Single file, no Angular, used by `run-conformance.sh ts` |
| CI | GitHub Actions: lint, typecheck, unit, conformance (`ts`), Playwright, production build | Java-mode conformance runs as an optional, manually triggered job (needs a JDK and an upstream clone) |

## Repository layout

Angular CLI workspace at the repository root, following spec 01 §2:

```
package.json, angular.json, tsconfig*.json, vitest.config.ts, playwright.config.ts
src/
  app/
    core/            pure TS: parser, address, data-space, fpu, commands/, program, interpreter
                     (lint rule forbids imports of @angular/*, rxjs, and DOM globals here)
    ui/              shell/, document/, editor/, registers/, fpu/, memory/, help/, devices/, common/
    services/        settings, file, help, keyboard shortcuts
    theme/           design tokens (CSS custom properties), light + dark
  assets/
    help/en/*.htm + index.json (generated), images/ (logos, photos), fonts/
  headless/run.ts
scripts/             build-help-index.mjs, fix-help-pages.mjs (LOOP* CX->ECX, spec 09 §1.1)
e2e/                 Playwright specs
spec/, reference/    unchanged
docs/plan.md         this file
```

`npm run conformance` builds the runner and calls
`JASMIN_TS_RUNNER="node dist/headless/run.js" bash spec/conformance/run-conformance.sh ts`.

## Architecture in one picture

```
            +-------------------- browser only --------------------+
            |                                                      |
 UI components (signals)  <--  DocumentStore (one per tab)  -->  devices (canvas, rAF)
            |                        |        ^
            |  commands: step/run/   |        | events: memoryWrite(addr,len),
            |  reset/edit/...        v        | stateChanged, stopped(error?)
            +------------------- Interpreter (core/) ------------------+
                                     |
                       Program (lines -> ParseResults)  +  DataSpace + Fpu
                                     |
                                Node: src/headless/run.ts
```

- `core/` exposes a small synchronous API: `program.setText()`, `interpreter.step()`,
  `interpreter.runSlice(budgetMs)`, `executeLine(n)`, `reset()`, `takeSnapshot()`, plus a
  plain callback-based event emitter (no RxJS in core).
- `DocumentStore` (Angular service, one instance per document tab) owns the core
  objects, drives the cooperative run loop (time-sliced batches, `setTimeout(0)`
  between slices, `JASMINSLEEP` as a timer), and exposes **one `version` signal** that
  bumps on "refresh all panels" (spec 04 §9.6). Panels derive their view from it, so
  registers/memory/FPU refresh after Step and at the end of Run exactly like the
  original, while devices subscribe to memory writes and repaint once per animation
  frame during a run.
- The editor feeds text changes to `Program`, which re-parses the whole document per
  change (allowed by spec 02 §6.5) and returns per-line highlight spans and errors; the
  editor turns these into CodeMirror decorations. Highlighting is computed from our
  parser, not a separate grammar, so colors always agree with what the interpreter
  thinks a token is.

## Milestones

Each milestone ends with something runnable and a green CI. M1-M3 are pure TypeScript
and can proceed in parallel with M4 once M0 is in.

### M0. Scaffold
- Angular workspace, strict TS, ESLint (+ the `core/` import restriction), Prettier.
- Vitest, Playwright and esbuild wiring; `npm run conformance` with a stub runner that
  prints the four sections for an empty program.
- GitHub Actions workflow running all of the above.
- Theme tokens and fonts in place; an empty shell page renders.
- **Done when:** CI is green and `npm run conformance` runs (and fails 44/44 as
  expected).

### M1. Parser and machine model (core)
- `number-literals`, `op-types` (`humanName`/`humanNamesArray`), `address`
  (effective-address grammar), `parser` (spec 03 including the full error catalogue
  and spans), `program` (labels, variables, constants, "previous label-only line",
  duplicate-label errors).
- `data-space` (memory with offset, registers with partial writes, flags, variables,
  constants, `nextFree`, label markers, change stamps), `fpu` (x87 stack, tags, status,
  Java `Double.toString` formatter).
- Headless runner prints real `PARSE` lines and the final state.
- **Done when:** unit tests cover every literal form, the error catalogue and
  `humanNamesArray` messages (spec 08 §5); `30-errors` passes its parse lines.

### M2. Instruction set (core)
- One module per Java command family, registered in a static mnemonic table (all 230
  mnemonics in `spec/conformance/mnemonics.txt`). `BigInt` only where 64-bit results
  are needed (spec 01 §2 "Arithmetic").
- Order by conformance program: data movement and ALU (01-15), stack and control flow
  (16-21), directives and labels (22-24), strings and BCD (25-27), FPU (28-29), errors
  and runtime faults (30-35), FIX items (36-42), upstream tests (43-44).
- All FIX dispositions from spec 07 applied, with the `.port.expected` files as the
  oracle.
- **Done when:** `npm run conformance` passes **44/44**, and each FIX item not covered
  by a program has a unit test (spec 08 §5 list).

### M3. Interpreter control (core)
- Step, Run (as `runSlice`), Execute current line, Pause, Stop, Reset, breakpoints
  (moving with their line, Q-UI-2), "ignore the breakpoint we start on", error
  handling with EIP left on the failing line (Q-E-1), change-counter rules (spec 04 §8),
  snapshots and the JSON `.mem` (de)serializer (spec 09 §4.3).
- **Done when:** unit tests cover bold-state after Step vs. Run, breakpoint movement,
  `JASMINSLEEP`, an infinite loop that stays pausable, and `.mem` round-trips including
  NaN/Infinity in the FPU.

### M4. Shell and document layout (UI)
- Menu bar (File/Edit/Run) with accelerators shown, toolbar with groups and tooltips,
  tab strip with Close Tab context menu, Welcome tab on start.
- Document view: the four nested split panes with 300 px / 350 px / height-350 defaults,
  persisted as `split1..4.location`.
- Enablement rules from spec 02 §4 as one computed signal per action; keyboard
  shortcuts with the browser-safe substitutes (Alt+N, Ctrl+Y/Ctrl+Shift+Z).
- `SettingsService` over `localStorage` key `jasmin.settings`.
- **Done when:** Playwright tests assert the enablement table for the "help tab",
  "document idle" and "document running" states (with a fake running store).

### M5. Panels (UI)
- **Editor:** CodeMirror with our highlight decorations, auto-indent, context menu,
  read-only while running, error line below. Gutter numbered from 0 that keeps
  numbering empty rows to the bottom of the viewport, breakpoint toggle on click,
  set-EIP on right-click, full-width execution mark, scroll-to-mark.
- **Registers:** format toggles, collapsed/expanded rows with EAX/AX/AH/AL labels,
  bold-on-change per byte, inline editing in the current radix, highlight colors.
- **Flags:** 4x2 checkbox grid, writable.
- **FPU:** 8-row table, ST0 bold, editable values.
- **Memory:** toolbar (desc/hex/highlight, 8/16/32 bit), CDK virtual-scroll table
  that stays smooth at multi-megabyte sizes, editable cells, bold rows, stack tint,
  register highlight.
- **Done when:** the app runs the spec examples end to end by hand and by Playwright
  (type code, Step, Run, breakpoints, edit a register and a memory cell).

### M6. Help and pages
- Copy `help/en/*.htm` from upstream (pinned commit), apply the LOOP* fix, generate
  `index.json`. Context help pane follows the caret, rendered in a sandboxed,
  script-free container restyled to the app's typography.
- Welcome and Configuration pages as Angular components with the same texts, links
  (`#new`, `#openFile`), credits plus a port credit line, and per-tab back/forward.
- **Done when:** every mnemonic with a page shows it; missing ones show the spec's
  "no help" texts.

### M7. I/O devices
- 7-Segment, StripLight, Console, Graphics on `<canvas>`, scaled and centered, with
  click-to-toggle bits, right-click menus and the exact dialog texts from spec 06.
  Live repaint coalesced to one per animation frame while running.
- **Done when:** unit tests for bit-to-segment/lamp/pixel mapping and console modes;
  the `2017` 7-segment example renders as in `reference/screenshots/emcelettronica/7-segmenti.jpg`.

### M8. Files and persistence
- Open/Save Code and Save/Load Memory via the File System Access API with remembered
  handles, falling back to `<input type=file>` and downloads. `beforeunload` prompt
  with unsaved edits (Q-UI-5).
- **Done when:** Playwright covers open, save-as, save memory, load memory, and the
  `Not a Jasmin memory file.` error.

### M9. Polish and release
- Side-by-side screenshot review against `reference/screenshots/` (layout parity, not
  pixel parity); accessibility pass (focus order, keyboard-only use, contrast in both
  themes); performance check (a 1M-instruction loop stays pausable; 1 MB memory scrolls
  smoothly).
- README update, version shown on Welcome, production build as a static site. The
  hosting target (e.g. GitHub Pages, which needs the repo public or a paid plan, or any
  static host) is the owner's call when we get here.

## Visual direction

**Principle: keep the geometry and the meaning of every color; replace the chrome.**
The layout, the order of things, the labels and what each color *means* (mnemonic,
register, label, variable, constant, comment, error, stack, changed value, execution
point) stay. Everything Swing-specific goes.

### Chrome
- **Surfaces:** a neutral app background with panels as flat cards (1px hairline
  border, 8px radius, no shadows inside the workspace). Titled boxes (`Registers`,
  `FPU Registers`, `Memory`) become small uppercase section headers inside the card
  instead of etched borders.
- **Split dividers:** 3 px hit area as in the original, drawn as a 1 px line that
  highlights on hover and while dragging.
- **Toolbar:** one 40 px row, icon buttons 32x32 with 18 px Lucide icons, grouped by
  thin separators in the original order. Run is the only colored button (green play,
  turns to an amber pause while running); Stop is red only on hover. Tooltips keep the
  original texts plus the shortcut.
- **Menu bar:** kept (File, Edit, Run) as a slim text row above the toolbar, with
  dropdowns as CDK overlays showing icons and shortcuts.
- **Tabs:** document/help tabs as a flat tab strip with an underline on the active tab
  and a close button on hover (in addition to the right-click Close Tab). The bottom
  pane's tabs stay on the left edge as a vertical list of horizontal labels, styled as
  a compact side navigation.
- **Segmented toggles:** `bin | ±dec | dec | hex`, `desc | hex | highlight` and
  `8 Bit | 16Bit | 32Bit` become segmented controls with a tinted selected segment,
  the modern form of the "pressed" toggles in the screenshots.
- **Fields and tables:** register fields as borderless monospace cells with a subtle
  background that gains a focus ring when edited; memory and FPU tables with no grid
  lines, zebra-free, tabular figures, sticky headers.
- **Icons mapping (Lucide):** new `file-plus`, open `folder-open`, save `save`, undo
  `undo-2`, redo `redo-2`, cut `scissors`, copy `copy`, paste `clipboard-paste`, back
  `arrow-left`, forward `arrow-right`, run `play`, pause `pause`, step `step-forward`,
  execute line `text-cursor-input`, stop `square`, reset `rotate-ccw`, take snapshot
  `camera`, load snapshot `history`, breakpoint a filled red dot. The original PNGs are
  not used (they stay credited in `spec/09` as upstream assets; the logo and photos on
  the Welcome/Configuration pages are kept).

### Color
Semantic colors keep their hue so screenshots and course material still match, but are
retuned for contrast and paired with a dark-mode variant. Defined as CSS custom
properties in `theme/`:

| Token | Original | Light | Dark |
|---|---|---|---|
| mnemonic | `rgb(0,0,144)` bold | `#1d3fbf` bold | `#92b2ff` bold |
| register | `rgb(0,144,40)` bold | `#0e6b2d` bold | `#6fd28f` bold |
| label | `rgb(255,144,0)` bold | `#9a5100` bold | `#ffb35c` bold |
| constant | `rgb(174,0,204)` bold | `#8c1aa6` bold | `#e29df4` bold |
| variable | `rgb(0,128,128)` bold | `#0a666c` bold | `#5fd0d6` bold |
| comment | `rgb(128,128,128)` italic | `#5d636c` italic | `#a4aab3` italic |
| error | red underline | `#b7241a` wavy underline | `#ff8b80` wavy underline |
| execution mark | `rgb(0,255,0)` | `#34c759` row band at 28% plus a solid 3 px left bar | same hue, 20% |
| stack rows | `rgb(210,240,200)` | `#e3f4dc` | `#1f3a24` |
| changed value | bold | bold plus a short fade-in accent | same |
| register highlights | EAX..EDI pastels | same pastels, slightly desaturated | 25% tints of the same hues |

The values above were retuned in M9 so every syntax color reaches WCAG AA (4.5:1) on
the panel background, the read-only background and the execution mark, in both themes
(`src/app/theme/tokens.css` is the source of truth).

Typography: Inter 13 px for UI, JetBrains Mono 13 px for the editor and all numeric
cells. The `font` setting still exists; its list gains the bundled fonts, and the
default becomes `JetBrains Mono` (the original's `Sans Serif` default stays
selectable).

Light theme is the default; dark follows `prefers-color-scheme` with a manual override
on the Configuration page.

### What does not change
Panel positions and default sizes, label texts (`EAX: `, `Carry`, `signed int`, ...),
number formats, the zero-based gutter, the bottom-pane tab order, dialog texts, and all
enablement rules. A Playwright test checks the presence and order of these against the
spec so styling work cannot drift the layout.

## Spec updates that come with this plan

Small edits to keep the spec and the plan consistent, made in the M0 PR:
- README principle 1: "colors match" becomes "color *meanings* match; exact values are
  design tokens (docs/plan.md)".
- 02 §3 and 09 §1.2: toolbar icons are Lucide SVGs; the PNG icons are not shipped.
- 02 §6.1 and 09 §3: default editor font `JetBrains Mono`; a light/dark theme setting.

## Risks and how we handle them

| Risk | Mitigation |
|---|---|
| Exact parity of error messages and spans | Port `humanNamesArray` literally; generate expectations with the Java harness (`spec/reference-harness`) whenever in doubt |
| 64-bit arithmetic and Java `Double.toString` formatting | Dedicated helpers with exhaustive unit tests; conformance programs 06-08, 11, 28-29 exercise them |
| CodeMirror gutter rows beyond the last line | Custom gutter that renders rows to the viewport height; covered by a Playwright test |
| Long runs freezing the tab | Time-sliced run loop with an 8 ms budget; perf test in M9 |
| Browser-reserved shortcuts | Spec 02 §2 substitutes; shortcuts shown in menus |
