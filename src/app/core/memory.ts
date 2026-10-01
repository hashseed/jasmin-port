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
    for (const listener of this.listeners) listener(address, value & 0xff);
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
