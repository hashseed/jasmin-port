import { MemoryRange } from '../core';
import { Rect, idiv, rectContains, roundFloat } from './geometry';

export const MIN_BARS = 1;
export const MAX_BARS = 32;

// Unscaled geometry of StripLight.java.
const DISTANCE = 5;
const BORDER = 20;
const BAR_WIDTH = 7;
const BAR_HEIGHT = 20;

/** Configuration of one document's StripLight (spec 06 §2). */
export class StripLightDevice {
  /** Called when the watched bytes move or resize (set by the DeviceSet). */
  onRangeChange: () => void = () => undefined;
  private addressValue: number;
  private barCount = 16;

  constructor(address: number) {
    this.addressValue = address;
  }

  get address(): number {
    return this.addressValue;
  }

  set address(address: number) {
    this.addressValue = address;
    this.onRangeChange();
  }

  get bars(): number {
    return this.barCount;
  }

  set bars(bars: number) {
    this.barCount = bars;
    this.onRangeChange();
  }

  /** `ceil(bars / 8)` bytes, little-endian. */
  get byteCount(): number {
    return Math.ceil(this.bars / 8);
  }

  /** The bytes the lamps show. */
  get range(): MemoryRange {
    return { start: this.address, end: this.address + this.byteCount };
  }

  watches(address: number): boolean {
    return address >= this.address && address < this.address + this.byteCount;
  }
}

/** Whether lamp `lamp` (counted from the right) is lit: bit `lamp` of the little-endian bytes. */
export function lampLit(bytes: readonly number[], lamp: number): boolean {
  return (((bytes[lamp >> 3] ?? 0) >> (lamp & 7)) & 1) === 1;
}

/** Lamps from left to right as `1`/`0`, for tests and accessibility. */
export function describeLamps(bytes: readonly number[], bars: number): string {
  let text = '';
  for (let lamp = bars - 1; lamp >= 0; lamp--) text += lampLit(bytes, lamp) ? '1' : '0';
  return text;
}

export interface LampShape {
  /** Lamp index counted from the right (= bit index). */
  readonly lamp: number;
  readonly rect: Rect;
}

export interface StripLightLayout {
  readonly background: Rect;
  readonly lamps: readonly LampShape[];
}

/** Geometry in a `width` x `height` area, as `StripLight.paint` computes it. */
export function stripLightLayout(
  width: number,
  height: number,
  bars: number,
): StripLightLayout | null {
  if (width <= 0 || height <= 0) return null;
  const desiredWidth = bars * BAR_WIDTH + (bars - 1) * BAR_WIDTH * 2 + 2 * BORDER;
  const desiredHeight = BAR_HEIGHT + 2 * BORDER;
  const factor = Math.min(Math.fround(width / desiredWidth), Math.fround(height / desiredHeight));
  const high = roundFloat(BAR_HEIGHT * factor);
  const wid = roundFloat(BAR_WIDTH * factor);
  const dist = roundFloat(DISTANCE * factor);
  const bord = roundFloat(BORDER * factor);
  const x0 = idiv(width - bars * wid - (bars - 1) * dist, 2);
  const y0 = idiv(height - high, 2);
  const background: Rect = {
    x: x0 - bord,
    y: y0 - bord,
    width: bars * wid + (bars - 1) * dist + bord * 2,
    height: high + bord * 2,
  };
  const lamps: LampShape[] = [];
  for (let lamp = 0; lamp < bars; lamp++) {
    lamps.push({
      lamp,
      rect: { x: x0 + (bars - lamp - 1) * (dist + wid), y: y0, width: wid, height: high },
    });
  }
  return { background, lamps };
}

/** The lamp under `(x, y)`, or null. */
export function hitLamp(layout: StripLightLayout, x: number, y: number): LampShape | null {
  return layout.lamps.find((shape) => rectContains(shape.rect, x, y)) ?? null;
}
