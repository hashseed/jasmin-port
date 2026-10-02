const NEVER = Number.MIN_SAFE_INTEGER;

/** Listener for byte writes, used by the I/O devices (spec 06). */
export type MemoryWriteListener = (address: number, value: number) => void;

/** Byte-addressed memory starting at `offset`, with change stamps (port of `Memory`). */
export class Memory {
  readonly bytes: Uint8Array;
  private readonly dirty: Float64Array;
  private stamp = 0;
  private readonly listeners = new Set<MemoryWriteListener>();

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
    if (this.listeners.size !== 0) {
      for (const listener of this.listeners) listener(address, value & 0xff);
    }
  }

  /**
   * Writes the low `size` bytes (at most 4) of `value` little-endian, as `size`
   * calls of `set` would.
   */
  setLittleEndian(address: number, value: number, size: number): void {
    let v = value;
    if (this.listeners.size !== 0) {
      // Listeners may read memory: notify after each byte, like `set`.
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

  addListener(listener: MemoryWriteListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
