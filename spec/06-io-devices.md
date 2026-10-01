# 06. I/O devices (memory-mapped output modules)

Sources: `src/jasmin/gui/SevenSegment.java`, `StripLight.java`, `Console.java`,
`VGA.java`, `PolygonObject.java`, `IGuiModule.java`.

Each document has four devices, shown as tabs in the bottom pane after `Help`. Each
device watches a region of the document's memory. Devices read memory; the program
drives them by writing to that region. Some devices let the user click to flip bits.

Common rules:
- Each device starts at address = `offset` (start of memory), i.e. it overlaps the
  data area by default. The user moves it with **Change address** (right-click menu).
- Address dialog: prompt `Please enter a new address for the display to use:` (console:
  `...for the console to use:`), prefilled with `0x` + current address in lowercase hex.
  Input accepts any literal form (03 §3). Invalid number or address outside
  `[offset, offset + memorySize]`: message `The entered value was not valid!` and no
  change.
- Integer dialogs (digits, bars, width, height) show the same message for invalid
  input.
- Choice dialogs are titled `Please choose` with the listed buttons plus `Cancel`.
- A device listens to memory writes only while its tab is selected, and refreshes when
  its tab is selected and on every "refresh all panels" (04 §9.6). While a run is in
  progress, writes to the watched bytes repaint the visible device immediately.
  *Port note:* coalesce repaints to one per animation frame.
- All devices scale their drawing to fit the tab area while keeping proportions, and
  center it. Off-state elements are drawn at 20% brightness of the on color, the
  display background at 10% (`darken(c, f)` multiplies each RGB channel by `f`,
  rounded).
- Device configuration is per document and not persisted.

## 1. 7-Segment (`7-Segment` tab)

- Shows `digits` seven-segment digits (default 4, range 1-8). Reads `digits` bytes
  starting at the address; **byte i drives digit i, counted from the right** (byte 0 =
  rightmost digit).
- Segment bit mapping within a byte (standard a-g): bit0 top, bit1 upper right, bit2
  lower right, bit3 bottom, bit4 lower left, bit5 upper left, bit6 middle. Bit 7 is
  unused (no decimal point).
- Geometry (unscaled): segment length 40, half-thickness 4, gap 1, border 20, digit
  spacing 2x thickness. Segments are hexagons (pointed ends).
- Colors: on = blue `rgb(64,144,255)` or "jasmin" pink `rgb(248,128,224)`, chosen
  **randomly** when the document is created.
- Left-click a segment: toggle its bit in memory (read-modify-write of the watched
  bytes).
- Right-click menu: `Change address`, `Change digits` (prompt `Please enter the number
  of digits: (1-8)`), `Change color` (choice `blue` / `jasmin`, prompt `Choose the
  color:`).
- Example: `mov byte [0], 0x3F` shows `0` on the rightmost digit (segments a-f).

## 2. StripLight (`StripLight` tab)

- A row of `bars` lamps (default 16, range 1-32) reading `ceil(bars/8)` bytes
  little-endian from the address. **Bit i is lamp i counted from the right.**
- Lamp: rectangle 7 wide x 20 high, gap 5, border 20 (unscaled). On color yellow
  `rgb(255,255,0)`.
- Left-click a lamp: toggle its bit.
- Right-click menu: `Change address`, `Change digits` (prompt `Please enter the number
  of bars: (1-32)`). (Menu text says digits; keep.)

## 3. Console (`Console` tab)

- A read-only text area, monospaced 15 pt, green text on dark green
  `rgb(30,46,28)` with a 5 px border of the same color.
- Default address: `offset`. Two modes, chosen with **Change Mode** (choice
  `Array-based` / `Pipe-like`, prompt `Choose the input mode`):
  - **Array-based** (default): shows the zero-terminated string starting at the
    address (bytes as ISO-8859-1 characters). Updates live: writing a byte inside the
    string replaces that character; writing 0 inside truncates; writing a non-zero byte
    at the terminator position extends the string (and continues through following
    non-zero bytes).
  - **Pipe-like:** every byte written to the address (one address only) is appended as
    if typed: printable characters append; 8 (backspace) deletes the last character;
    10 (newline) starts a new line. Writes that happen while the tab is not visible are
    queued and replayed when it becomes visible.
- Right-click menu: `Change Address`, `Change Mode`, `Clear` (clears the text; enabled
  only in pipe mode).
- Reset clears the text.
- Example (pipe): `mov al, 'H'` / `mov [0], al` / `mov al, 'i'` / `mov [0], al`
  prints `Hi`.

## 4. Graphics (`Graphics` tab)

- A pixel grid `width x height` (default 16 x 16; any positive integer via `Change
  width` / `Change height`, prompts `Please enter the width in pixels: (default 16)` and
  `...height...`). Pixels are row-major from the address, top-left first.
- Color modes (`Change color mode`, choice `Binary` / `8 Colors` / `TrueColor`, prompt
  `Choose the color mode:`):

| Mode | Bytes | Layout |
|---|---|---|
| Binary (default) | `ceil(w*h/8)` | 1 bit per pixel, **LSB first** (bit 0 of byte 0 = pixel (0,0)); on color = blue or jasmin pink (random at creation, `Change binary color`), off at 20% |
| 8 Colors | `ceil(w*h/2)` | 4 bits per pixel, low nibble = first pixel; within a nibble bit0 = red, bit1 = green, bit2 = blue (each 0 or 255); bit3 unused |
| TrueColor | `w*h*4` | 4 bytes per pixel: R, G, B, unused |

- Pixels are squares with a 1 px gap (no gap if width > 160 or height > 120), the grid
  surrounded by a one-pixel-wide border of the background color.
- Left-click in Binary mode toggles that pixel's bit. Other modes ignore clicks.
- Right-click menu: `Change address`, `Change width`, `Change height`, `Change color
  mode`, `Change binary color` (choice `blue` / `jasmin`, prompt `Choose the color:`).
- Bytes beyond the end of memory read as 0.
- *Port note:* render with a `<canvas>`; hit-test clicks by pixel coordinates.
