import { DataSpace, MachineSession, MemoryRange, SessionEvent } from '../core';
import { randomColor } from './color';
import { ConsoleDevice } from './console';
import { GraphicsDevice } from './graphics';
import { ByteReader, memoryReader } from './memory-range';
import { SevenSegmentDevice } from './seven-segment';
import { StripLightDevice } from './strip-light';

/** The device tabs of the bottom pane, in order (spec 02 §5). */
export const DEVICE_KINDS = ['7-Segment', 'StripLight', 'Console', 'Graphics'] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

/** Why a device must repaint: a watched byte was written, or a full refresh. */
export type DeviceChange =
  { readonly kind: 'write'; readonly device: DeviceKind } | { readonly kind: 'refresh' };

// Preallocated: a running program may write watched bytes millions of times.
const WRITE = Object.fromEntries(
  DEVICE_KINDS.map((device) => [device, { kind: 'write', device } as const]),
) as Record<DeviceKind, DeviceChange>;

/**
 * The four I/O devices of one document (spec 06) and their link to its machine.
 * Framework-free: it listens to memory writes and session events and tells its
 * listeners what to repaint; the UI decides when (once per animation frame).
 * It watches only the bytes the devices show (and, for the Console, the bytes
 * whose writes can change its text), so writes elsewhere stay on the fast path;
 * the ranges follow every change of a device's address, size or mode.
 *
 * Configuration is per document and not persisted. On Reset the Console clears
 * (spec 04 §9.7); the other devices simply show the zeroed memory. When Load Memory
 * replaces the machine, the devices follow the new memory, and an address outside
 * it moves to the new start of memory.
 */
export class DeviceSet {
  readonly sevenSegment: SevenSegmentDevice;
  readonly stripLight: StripLightDevice;
  readonly console: ConsoleDevice;
  readonly graphics: GraphicsDevice;

  private dsp: DataSpace;
  private reader: ByteReader;
  private unsubscribeMemory: () => void;
  private readonly onMemoryWrite = (address: number, value: number) => this.onWrite(address, value);
  /** The ranges last passed to the memory, flattened, to skip unchanged updates. */
  private watched: number[] = [];
  private readonly unsubscribeSession: () => void;
  private readonly listeners = new Set<(change: DeviceChange) => void>();

  constructor(
    private readonly session: MachineSession,
    random: () => number = Math.random,
  ) {
    this.dsp = session.dsp;
    this.reader = memoryReader(this.dsp);
    const start = this.dsp.offset;
    this.sevenSegment = new SevenSegmentDevice(start, randomColor(random));
    this.stripLight = new StripLightDevice(start);
    this.console = new ConsoleDevice(start);
    this.graphics = new GraphicsDevice(start, randomColor(random));
    this.unsubscribeMemory = this.listen();
    for (const device of this.devices()) device.onRangeChange = () => this.updateWatched();
    this.unsubscribeSession = session.subscribe((event) => this.onSessionEvent(event));
  }

  /** The machine whose memory the devices show. */
  get dataSpace(): DataSpace {
    return this.dsp;
  }

  /** Reads a byte of memory (0 outside memory). */
  get read(): ByteReader {
    return this.reader;
  }

  subscribe(listener: (change: DeviceChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Re-reads every device and asks for a full repaint (after a configuration change). */
  refresh(): void {
    this.console.refresh(this.reader);
    this.emit({ kind: 'refresh' });
  }

  dispose(): void {
    for (const device of this.devices()) device.onRangeChange = () => undefined;
    this.unsubscribeMemory();
    this.unsubscribeSession();
    this.listeners.clear();
  }

  private onWrite(address: number, value: number): void {
    if (this.sevenSegment.watches(address)) this.emit(WRITE['7-Segment']);
    if (this.stripLight.watches(address)) this.emit(WRITE.StripLight);
    if (this.graphics.watches(address)) this.emit(WRITE.Graphics);
    if (this.console.write(address, value, this.reader)) this.emit(WRITE.Console);
  }

  private onSessionEvent(event: SessionEvent): void {
    if (event.kind === 'machine-replaced') {
      this.attach(this.session.dsp);
    } else if (event.kind === 'refresh' && !event.live) {
      // During Run, the writes to the watched bytes already repaint the devices.
      if (event.reset) this.console.clear();
      this.refresh();
    }
  }

  private attach(dsp: DataSpace): void {
    this.unsubscribeMemory();
    this.dsp = dsp;
    this.reader = memoryReader(dsp);
    this.unsubscribeMemory = this.listen();
    const inside = (address: number) =>
      address >= dsp.offset && address <= dsp.offset + dsp.memorySize;
    for (const device of this.devices()) {
      if (!inside(device.address)) device.address = dsp.offset;
    }
  }

  private devices() {
    return [this.sevenSegment, this.stripLight, this.console, this.graphics] as const;
  }

  private ranges(): MemoryRange[] {
    return this.devices().map((device) => device.range);
  }

  /** Listens to writes to the devices' bytes of the current memory. */
  private listen(): () => void {
    const ranges = this.ranges();
    this.watched = ranges.flatMap((r) => [r.start, r.end]);
    return this.dsp.memory.addListener(this.onMemoryWrite, ranges);
  }

  /** A device moved or resized: watch its new bytes. */
  private updateWatched(): void {
    const ranges = this.ranges();
    const watched = ranges.flatMap((r) => [r.start, r.end]);
    if (watched.every((v, i) => v === this.watched[i])) return;
    this.watched = watched;
    this.dsp.memory.watch(this.onMemoryWrite, ranges);
  }

  private emit(change: DeviceChange): void {
    for (const listener of this.listeners) listener(change);
  }
}
