import { ByteReader } from './memory-range';

export type ConsoleMode = 'array' | 'pipe';

/** Labels of the mode choice dialog, in order (spec 06 §3). */
export const CONSOLE_MODE_LABELS: Readonly<Record<ConsoleMode, string>> = {
  array: 'Array-based',
  pipe: 'Pipe-like',
};

const BACKSPACE = 8;
const TAB = 9;
const NEWLINE = 10;
const DELETE = 0x7f;

/** A byte as an ISO-8859-1 character. */
const latin1 = (byte: number): string => String.fromCharCode(byte & 0xff);

/**
 * The Console device (spec 06 §3, `Console.java`): the text it shows and how
 * memory writes change it.
 *
 * - Array-based: the zero-terminated string at `address`, kept up to date
 *   incrementally from writes (O(1) per write while a program runs).
 * - Pipe-like: every byte written to `address` is "typed": printable characters
 *   append, 8 deletes the last character, 10 starts a new line. The original
 *   queued writes while the tab was hidden and replayed them when shown; applying
 *   them immediately gives the same text.
 */
export class ConsoleDevice {
  mode: ConsoleMode = 'array';
  private content = '';

  constructor(public address: number) {}

  get text(): string {
    return this.content;
  }

  /** Clears the text (Reset; the `Clear` menu item in pipe mode). */
  clear(): void {
    this.content = '';
  }

  /** Re-reads the string in array mode (refresh, address or mode change); pipe mode keeps its text. */
  refresh(read: ByteReader): void {
    if (this.mode !== 'array') return;
    let text = '';
    for (let address = this.address; ; address++) {
      const byte = read(address);
      if (byte === 0) break;
      text += latin1(byte);
    }
    this.content = text;
  }

  /** Change Mode: switching to pipe clears the text, to array re-reads it. */
  setMode(mode: ConsoleMode, read: ByteReader): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'pipe') this.clear();
    else this.refresh(read);
  }

  /** Change Address: array mode re-reads, pipe mode keeps its text. */
  setAddress(address: number, read: ByteReader): void {
    this.address = address;
    this.refresh(read);
  }

  /** A byte was written; returns whether the text changed. */
  write(address: number, value: number, read: ByteReader): boolean {
    return this.mode === 'pipe' ? this.type(address, value) : this.patch(address, value, read);
  }

  private type(address: number, value: number): boolean {
    if (address !== this.address) return false;
    if (value === BACKSPACE) {
      if (this.content.length === 0) return false;
      this.content = this.content.slice(0, -1);
    } else if (value === NEWLINE || value === TAB || (value >= 0x20 && value !== DELETE)) {
      this.content += latin1(value);
    } else {
      return false;
    }
    return true;
  }

  private patch(address: number, value: number, read: ByteReader): boolean {
    const length = this.content.length;
    const pos = address - this.address;
    if (pos < 0 || pos > length) return false;
    if (pos < length) {
      // Inside the string: replace the character, or truncate at a new terminator.
      this.content =
        value !== 0
          ? this.content.slice(0, pos) + latin1(value) + this.content.slice(pos + 1)
          : this.content.slice(0, pos);
      return true;
    }
    // At the terminator: a non-zero byte extends the string through the following bytes.
    if (value === 0) return false;
    let text = this.content + latin1(value);
    for (let next = address + 1; ; next++) {
      const byte = read(next);
      if (byte === 0) break;
      text += latin1(byte);
    }
    this.content = text;
    return true;
  }
}
