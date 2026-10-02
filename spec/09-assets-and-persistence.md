# 09. Assets, settings and file formats

Sources: `src/jasmin/core/HelpLoader.java`, `src/jasmin/gui/MainFrame.java`,
`src/jasmin/gui/JasDocument.java`, `src/jasmin/core/DataSpace.java`,
`src/jasmin/gui/resources/`, `help/en/`, `LICENSE.md`.

## 1. Bundled assets

Everything ships as static files in the Angular build (`src/assets/`). Nothing is
fetched from a server at run time except these files themselves, so the app works
offline once loaded.

### 1.1 Help pages (`help/en/*.htm`, 199 files, about 800 KB)

- One standalone XHTML page per mnemonic, file name = upper-case mnemonic + `.htm`
  (e.g. `ADD.htm`). Content is inline-styled (`font-family:Helvetica,Arial,sans-serif;
  font-size:11px`) with `Command`, `Arguments`, `Usage`, `Effects`, `Flags` and
  example sections.
- The original `HelpLoader` reads every file of `help/<language>/` into a map keyed by
  **lower-case file name without extension**; `get(mnemonic)` and `exists(mnemonic)`
  look up `mnemonic.toLowerCase()`. Languages are the sub-directories of `help/`; the
  repository ships only `en`.
- Port: copy the pages unchanged to `assets/help/en/`, and generate at build time an
  index `assets/help/en/index.json` mapping lower-case mnemonic to file name. The help
  service loads the index at start-up and fetches pages lazily (cache after first
  load). Pages are rendered in a sandboxed container (no scripts; the pages have none).
- Coverage gaps (mnemonics without a page, pages without a mnemonic) are listed in
  05 §14. The port shows the original's "no help" text for those (02 §11).
- Help text fixes: in `LOOP.htm`, `LOOPE.htm`, `LOOPZ.htm`, `LOOPNE.htm` and
  `LOOPNZ.htm`, replace the register name `CX` with `ECX` (whole word, including the
  example `MOV CX,N`), because the loops always use ECX (07 Q-I-14). All other pages
  ship unchanged.
- Only English is supported (README open question). The `language` setting is kept so
  more languages can be dropped in as `assets/help/<lang>/` later.

### 1.2 GUI resources (`src/jasmin/gui/resources/`)

| File | Use |
|---|---|
| `Welcome.htm` | Welcome page, opened in a help tab at start (02 §12.1) |
| `Configuration.htm` | Configuration page (02 §12.2); its controls are live Swing widgets, so the port rebuilds it as an Angular component with the same texts and layout |
| `jasminstyle.css` | Style of the two pages above |
| `jasmin_logo.png` | Logo on both pages; also the window/tab icon (*port:* not used; the port has its own icon, a white jasmine flower on a pink circle, `favicon.svg`) |
| `jasmin.jpg`, `jasmin2.jpg` | Photos on Welcome and Configuration (*port:* not used, §12.1 port note in 02) |
| `lrr_logo.png`, `tum_logo.gif` | Chair and university logos (credits) |
| `icons/*.png` (20) + `leer.gif` | Toolbar and menu icons (02 §3): `new`, `fileopen`, `filesaveas`, `undo`, `redo`, `editcut`, `editcopy`, `editpaste`, `back`, `forward`, `play_green`, `play_pause`, `play_step`, `play_current`, `play_stop`, `play_clear3`, `breakpoint`, `takesnapshot`, `loadsnapshot`, `configure`; `leer.gif` is an empty placeholder |

The port reuses the logos and photos unchanged but draws toolbar and menu icons as
Lucide SVGs (docs/plan.md, "Visual direction"), so `icons/*.png` and `leer.gif` are
not shipped. The images it ships stay unchanged (they are GPL-2.0 like the code, §5). The
`homepage/` directory (project web site) and `tests/` (two `.asm` samples) are not
shipped; the samples may be offered as examples.

## 2. Document names

- New documents are titled `new program` (02 §2; *port note:* the original says `new document`, renamed on the owner's request, 2026-10-02). Opening or saving `.asm` sets the
  tab title to the file name without path; the window title follows (02 §1).
- Save Code is always a "save as" dialog in the original. *Port note:* each document
  remembers the file it was opened from or last saved to (a File System Access API
  handle). Save Code writes back to that file without asking; a document without one
  (a new document) gets the save dialog, starting in the last directory and suggesting
  `<tab title>.asm`. **Ctrl+Shift+S** (Save Code As, keyboard only, no menu item)
  always shows the save dialog, suggesting the remembered file. Without the File
  System Access API (`<input type=file>` and downloads), Save Code always downloads a
  file named after the tab title with `.asm` appended, and the tab takes that name.
  The picker cannot rename the chosen file, so on that path `.asm` is only appended to
  the suggestion; the tab takes the name actually chosen.
- Save Memory always shows the save dialog (or downloads), suggesting the document's
  last memory file, else `lastpath.mem`, else `<tab title without .asm>.mem`. Load
  Memory remembers the loaded file the same way. Load Memory with no document
  selected does nothing.
- *Port addition:* a document is *modified* when its text differs from the text last
  opened or saved; its tab shows a small dot after the title (screen readers: "(unsaved
  changes)"). The window title does not change. While any open document is modified
  the page registers a `beforeunload` handler (07 Q-UI-5); closing a tab still never
  prompts.
- I/O errors (and `Not a Jasmin memory file.`) appear in an in-app modal message with
  the heading `Message` and an `OK` button (02 §13).

## 3. Settings

The original keeps a Java properties file `~/.jasmin`. On first start it is created
with `font`, `font.size`, `memory`, `language`; other keys appear when first written.
Every write is saved immediately.

| Key | Type | Default | Written by | Used for |
|---|---|---|---|---|
| `font` | string | `Sans Serif` (port: `JetBrains Mono`) | Configuration page | Editor and gutter font family |
| `font.size` | int | `12` | Configuration page | Editor and gutter font size |
| `memory` | int (bytes) | `4096` | Configuration page | Memory size of new documents (rounded up to a multiple of 4, 04 §1) |
| `offset` | int | `0` (absent at first start) | Configuration page | Start address of memory of new documents |
| `language` | string | `en` | Configuration page | Help language |
| `lastpath.asm` | path | none | Open/Save code | Initial file in the code dialogs |
| `lastpath.mem` | path | none | Save/Load memory | Initial file in the memory dialogs |
| `split1.location` ... `split4.location` | int (px) | computed (02 §5) | Divider moves | Initial divider positions of new documents |
| `theme` (port only) | `system` / `light` / `dark` | `system` | Configuration page | Color theme, applied immediately |

Port:
- Store the same keys in `localStorage` under one JSON object, key `jasmin.settings`.
  Missing or unparsable values fall back to the defaults above (the original instead
  aborts or crashes on a corrupt file; not worth reproducing).
- `lastpath.*` cannot hold a path in a browser. Keep the last used file name as the
  suggested name for downloads/save pickers, and use the File System Access API's
  `startIn`/`id` option to reopen the picker in the same directory.
- Settings changes affect documents opened afterwards, except `language` (immediate),
  as in 02 §12.2.

## 4. File formats

### 4.1 Code files (`.asm`)

- Plain text, the editor content verbatim. Read with the platform default charset in
  the original; the port reads and writes **UTF-8** and accepts any line ending
  (`\r\n`, `\n`, `\r`), normalizing to `\n` in the editor. Saving writes `\n`.
- Save appends `.asm` if the chosen name does not end with it (case-insensitive).
- The open dialog filters `*.asm` (02 §13) but any text file can be opened.

### 4.2 Memory files (`.mem`), original

`DataSpace.save` writes a ZIP archive with one entry `dataspace` (deflate level 9)
containing a Java `ObjectOutputStream` of, in order: memory size (int), register file
size (int), register file object, register cell info map, memory object, memory cell
info map, variables map, constants map, the flags CF OF SF ZF PF AF TF DF (booleans),
next free data address (int). Loading reads the same sequence and replaces the
document's machine state, including its memory size.

Because the register file class is not `Serializable`, saving always throws and the
error is swallowed, leaving an incomplete archive (07 Q-SN-1). No valid original
`.mem` file can exist, so the port **does not import** this format; Load Memory on a
ZIP file shows `Not a Jasmin memory file.`

### 4.3 Memory files (`.mem`), port

UTF-8 JSON, extension `.mem` (Save appends it like `.asm`):

```json
{
  "format": "jasmin-mem",
  "version": 1,
  "memorySize": 4096,
  "offset": 0,
  "memory": "<base64 of memorySize bytes, address offset first>",
  "registers": {
    "EAX": 0, "EBX": 0, "ECX": 0, "EDX": 0,
    "ESI": 0, "EDI": 0, "ESP": 4096, "EBP": 4096, "EIP": 0
  },
  "flags": { "CF": false, "OF": false, "SF": false, "ZF": false,
             "PF": false, "AF": false, "TF": false, "DF": false },
  "variables": { "MSG": 0 },
  "constants": { "LEN": 5 },
  "nextFree": 5,
  "labelCells": [
    { "kind": "memory", "address": 100, "size": 4, "label": "LOOP" },
    { "kind": "register", "register": "EAX", "label": "DONE" }
  ],
  "fpu": {
    "top": 0,
    "registers": ["0x0000000000000000", "...8 entries, R0..R7"],
    "tags": [3, 3, 3, 3, 3, 3, 3, 3],
    "status": { "C0": false, "C1": false, "C2": false, "C3": false,
                "IE": false, "DE": false, "ZE": false, "OE": false,
                "UE": false, "PE": false, "SF": false }
  }
}
```

- Register values are unsigned 32-bit integers; constants are signed integers within
  the 64-bit range (written as JSON numbers when safe, else as decimal strings).
- `labelCells` holds the label-valued markers (04 §4).
- `fpu` holds the FPU state (04 §7, 07 Q-SN-2): physical registers `R0..R7` as the
  16-digit hex of their IEEE-754 float64 bit pattern (exact, and NaN/Infinity survive),
  their tags (0 valid, 1 zero, 2 special, 3 empty), `TOP`, and the status flags.
  Change stamps (bold state) are not stored.
- **Load Memory** validates `format`, `version`, sizes and base64 length; on failure it
  shows `Not a Jasmin memory file.` and changes nothing. On success it replaces the
  document's memory size, offset, memory, registers, flags, variables, constants,
  `nextFree`, markers and FPU, clears the bold state, and refreshes all panels (devices
  included). The editor text is untouched.
- In-document snapshots (04 §9.10) use the same structure, held in memory.

## 5. Licensing and credits

- Jasmin is licensed under the **GNU GPL version 2** (`LICENSE.md`). The port reuses
  the help pages, images and the design of the original, so it is distributed under
  GPL-2.0 as well (or GPL-2.0-or-later only if the original copyright holders agree;
  default is GPL-2.0), with `LICENSE.md` copied to the repository root.
- Keep the credits block of `Welcome.htm` (chair, contributors, original version
  `1.5.11 (2016-10-28)`) and add a line for the web port and its version (02 §12.1).
  *Port note (owner's decision, 2026-10-02):* the Welcome page has no credits; they
  are in the README's "License and credits" section and `public/NOTICE.txt`.
- The bug-report line on the Welcome page points to the original authors' address;
  the port replaces it with the port's issue tracker.
