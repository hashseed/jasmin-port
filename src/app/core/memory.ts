const NEVER = Number.MIN_SAFE_INTEGER;

/** Listener for byte writes, used by the I/O devices (spec 06). */
export type MemoryWriteListener = (address: number, value: number) => void;

/** The addresses `start` up to, not including, `end`. */
export interface MemoryRange {
  readonly start: number;
  readonly end: number;
}

/** Byte-addressed memory starting at `offset`, with change stamps (port of `Memory`). */
export class Memory {
  readonly bytes: Uint8Array;
  private readonly dirty: Float64Array;
  private stamp = 0;
  /** Each listener with the ranges it watches; null watches every address. */
  private readonly listeners = new Map<MemoryWriteListener, readonly MemoryRange[] | null>();
  /**
   * The union of the watched ranges as sorted, disjoint `[start, end)` pairs, and
   * its hull: writes outside `[watchStart, watchEnd)` notify nobody and take the
   * fast path (also in compiled Run code, which reads these fields).
   */
  private watched: number[] = [];
  private watchStart = Infinity;
  private watchEnd = -Infinity;

  constructor(
    readonly size: number,
    readonly offset: number,
  ) {
    this.bytes = new Uint8Array(size);
    this.dirty = new Float64Array(size).fill(NEVER);
  }

  get(address: number): number {
    return this.bytes[address - this.offset];
  }

  set(address: number, value: number): void {
    const index = address - this.offset;
    this.bytes[index] = value;
    this.dirty[index] = this.stamp;
    if (address >= this.watchStart && address < this.watchEnd) this.notify(address, value & 0xff);
  }

  /**
   * Writes the low `size` bytes (at most 4) of `value` little-endian, as `size`
   * calls of `set` would.
   */
  setLittleEndian(address: number, value: number, size: number): void {
    let v = value;
    if (this.isWatched(address, size)) {
      // Listeners may read memory or change their ranges: notify after each byte, like `set`.
      for (let i = 0; i < size; i++) {
        this.set(address + i, v & 0xff);
        v >>>= 8;
      }
      return;
    }
    const index = address - this.offset;
    for (let i = 0; i < size; i++) {
      this.bytes[index + i] = v;
      this.dirty[index + i] = this.stamp;
      v >>>= 8;
    }
  }

  /** Whether a listener watches any of the `size` bytes at `address`. */
  isWatched(address: number, size: number): boolean {
    if (address >= this.watchEnd || address + size <= this.watchStart) return false;
    const watched = this.watched;
    for (let i = 0; i < watched.length; i += 2) {
      if (address < watched[i + 1] && address + size > watched[i]) return true;
    }
    return false;
  }

  reset(): void {
    this.bytes.fill(0);
    this.clearDirty();
  }

  setDirty(address: number): void {
    this.dirty[address - this.offset] = this.stamp;
  }

  isDirty(address: number, steps: number): boolean {
    return this.stamp - this.dirty[address - this.offset] <= steps;
  }

  updateDirty(): void {
    this.stamp++;
  }

  clearDirty(): void {
    this.stamp = 0;
    this.dirty.fill(NEVER);
  }

  /**
   * Calls `listener` after each byte written inside `ranges` (every byte if
   * omitted). Returns a function that removes it.
   */
  addListener(listener: MemoryWriteListener, ranges?: readonly MemoryRange[]): () => void {
    this.listeners.set(listener, ranges ?? null);
    this.updateWatched();
    return () => {
      if (this.listeners.delete(listener)) this.updateWatched();
    };
  }

  /**
   * Changes the ranges a listener watches (e.g. a device moved or resized). A
   * listener may call this while it is being notified: the following bytes of
   * the same write use the new ranges. Ignored for a removed listener.
   */
  watch(listener: MemoryWriteListener, ranges: readonly MemoryRange[]): void {
    if (!this.listeners.has(listener)) return;
    this.listeners.set(listener, ranges);
    this.updateWatched();
  }

  private notify(address: number, value: number): void {
    for (const [listener, ranges] of this.listeners) {
      if (ranges === null || ranges.some((r) => address >= r.start && address < r.end)) {
        listener(address, value);
      }
    }
  }

  private updateWatched(): void {
    const ranges: MemoryRange[] = [];
    for (const watched of this.listeners.values()) {
      if (watched === null) ranges.push({ start: -Infinity, end: Infinity });
      else for (const r of watched) if (r.start < r.end) ranges.push(r);
    }
    ranges.sort((a, b) => a.start - b.start);
    const merged: number[] = [];
    for (const { start, end } of ranges) {
      const last = merged.length - 1;
      if (last > 0 && start <= merged[last]) merged[last] = Math.max(merged[last], end);
      else merged.push(start, end);
    }
    this.watched = merged;
    this.watchStart = merged.length !== 0 ? merged[0] : Infinity;
    this.watchEnd = merged.length !== 0 ? merged[merged.length - 1] : -Infinity;
  }
}
