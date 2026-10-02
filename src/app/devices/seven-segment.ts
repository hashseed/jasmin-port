import { MemoryRange } from '../core';
import { ColorChoice } from './color';
import { Point, Polygon, Rect, idiv, polygonContains, roundFloat } from './geometry';

/** Segment names in bit order: bit 0 = a (top) ... bit 6 = g (middle); bit 7 is unused. */
export const SEGMENT_NAMES = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

export const MIN_DIGITS = 1;
export const MAX_DIGITS = 8;

// Unscaled geometry of SevenSegment.java.
const HALF_THICKNESS = 4;
const LENGTH = 40;
const GAP = 1;
const BORDER = 20;
const DIGIT_WIDTH = HALF_THICKNESS + GAP + LENGTH + GAP + HALF_THICKNESS;
const DIGIT_HEIGHT = HALF_THICKNESS + GAP + LENGTH + GAP + GAP + LENGTH + GAP + HALF_THICKNESS;

/** Configuration of one document's 7-Segment display (spec 06 §1). */
export class SevenSegmentDevice {
  /** Called when the watched bytes move or resize (set by the DeviceSet). */
  onRangeChange: () => void = () => undefined;
  private addressValue: number;
  private digitCount = 4;

  constructor(
    address: number,
    public color: ColorChoice,
  ) {
    this.addressValue = address;
  }

  get address(): number {
    return this.addressValue;
  }

  set address(address: number) {
    this.addressValue = address;
    this.onRangeChange();
  }

  get digits(): number {
    return this.digitCount;
  }

  set digits(digits: number) {
    this.digitCount = digits;
    this.onRangeChange();
  }

  get byteCount(): number {
    return this.digits;
  }

  /** The bytes the display shows. */
  get range(): MemoryRange {
    return { start: this.address, end: this.address + this.byteCount };
  }

  watches(address: number): boolean {
    return address >= this.address && address < this.address + this.digits;
  }
}

/** Whether segment `segment` (0-6) of a digit driven by `byte` is lit. */
export function segmentLit(byte: number, segment: number): boolean {
  return ((byte >> segment) & 1) === 1;
}

/** The lit segments of a digit as letters, e.g. `0x3F` -> `abcdef`. */
export function segmentLetters(byte: number): string {
  return SEGMENT_NAMES.filter((_, segment) => segmentLit(byte, segment)).join('');
}

/**
 * The display state for tests and accessibility: digits from left to right, each
 * as its lit segment letters (`-` when dark). `bytes[i]` drives digit i from the right.
 */
export function describeDigits(bytes: readonly number[]): string {
  return [...bytes]
    .reverse()
    .map((byte) => segmentLetters(byte) || '-')
    .join(' ');
}

export interface SegmentShape {
  /** Digit index counted from the right (= byte offset). */
  readonly digit: number;
  /** Segment 0-6 (= bit within the byte). */
  readonly segment: number;
  readonly polygon: Polygon;
}

export interface SevenSegmentLayout {
  readonly background: Rect;
  readonly segments: readonly SegmentShape[];
}

/**
 * Geometry of the display in a `width` x `height` area, scaled to fit and
 * centered with the integer arithmetic of `SevenSegment.paint`. As in the original,
 * the dark background extends a fixed 20 px around the digits.
 */
export function sevenSegmentLayout(
  width: number,
  height: number,
  digits: number,
): SevenSegmentLayout | null {
  if (width <= 0 || height <= 0) return null;
  const desiredWidth = digits * DIGIT_WIDTH + (digits - 1) * HALF_THICKNESS * 2 + 2 * BORDER;
  const desiredHeight = DIGIT_HEIGHT + 2 * BORDER;
  const factor = Math.min(Math.fround(width / desiredWidth), Math.fround(height / desiredHeight));
  const len = roundFloat(LENGTH * factor);
  const wid = roundFloat(HALF_THICKNESS * factor);
  const between = wid + wid;
  const digitWidth = wid + GAP + len + GAP + wid;
  const digitHeight = wid + GAP + len + GAP + GAP + len + GAP + wid;
  const x0 = idiv(width - digits * digitWidth - (digits - 1) * between, 2);
  const y0 = idiv(height - digitHeight, 2);
  const background: Rect = {
    x: x0 - BORDER,
    y: y0 - BORDER,
    width: digits * digitWidth + (digits - 1) * between + 2 * BORDER,
    height: digitHeight + 2 * BORDER,
  };
  const segments: SegmentShape[] = [];
  for (let digit = 0; digit < digits; digit++) {
    const shapes = digitPolygons(x0 + (digits - digit - 1) * (between + digitWidth), y0, len, wid);
    shapes.forEach((polygon, segment) => segments.push({ digit, segment, polygon }));
  }
  return { background, segments };
}

/** The seven hexagons of one digit at `(x0, y0)` (`SevenSegment.fillCoords`). */
function digitPolygons(x0: number, y0: number, len: number, wid: number): Polygon[] {
  const shift = (p: Polygon, dx: number, dy: number): Polygon =>
    p.map(({ x, y }) => ({ x: x + dx, y: y + dy }));
  const step = len + GAP + GAP;

  let left = wid + GAP + x0;
  let right = left + len;
  let top = y0;
  let bottom = y0 + wid + wid;
  const a: Point[] = [
    { x: left, y: top + wid },
    { x: left + wid, y: bottom },
    { x: right - wid, y: bottom },
    { x: right, y: top + wid },
    { x: right - wid, y: top },
    { x: left + wid, y: top },
  ];

  top = wid + GAP + y0;
  bottom = top + len;
  left = x0;
  right = x0 + wid + wid;
  const f: Point[] = [
    { x: left + wid, y: top },
    { x: left, y: top + wid },
    { x: left, y: bottom - wid },
    { x: left + wid, y: bottom },
    { x: right, y: bottom - wid },
    { x: right, y: top + wid },
  ];

  const g = shift(a, 0, step);
  const d = shift(g, 0, step);
  const e = shift(f, 0, step);
  const b = shift(f, step, 0);
  const c = shift(b, 0, step);
  return [a, b, c, d, e, f, g];
}

/** The segment under `(x, y)`, or null. */
export function hitSegment(layout: SevenSegmentLayout, x: number, y: number): SegmentShape | null {
  return layout.segments.find((shape) => polygonContains(shape.polygon, x, y)) ?? null;
}
