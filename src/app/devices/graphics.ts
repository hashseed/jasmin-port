import { ColorChoice, DEVICE_COLORS, OFF_BRIGHTNESS, Rgb, darken } from './color';
import { Rect, idiv } from './geometry';
import { ByteReader } from './memory-range';

export type GraphicsMode = 'binary' | '8colors' | 'truecolor';

/** Labels of the color mode choice dialog, in order (spec 06 §4). */
export const GRAPHICS_MODE_LABELS: Readonly<Record<GraphicsMode, string>> = {
  binary: 'Binary',
  '8colors': '8 Colors',
  truecolor: 'TrueColor',
};

/** Configuration of one document's Graphics display (spec 06 §4). */
export class GraphicsDevice {
  width = 16;
  height = 16;
  mode: GraphicsMode = 'binary';

  constructor(
    public address: number,
    public color: ColorChoice,
  ) {}

  get byteCount(): number {
    return graphicsByteCount(this.mode, this.width, this.height);
  }

  watches(address: number): boolean {
    return address >= this.address && address < this.address + this.byteCount;
  }
}

/** Bytes a `width` x `height` picture occupies in `mode`. */
export function graphicsByteCount(mode: GraphicsMode, width: number, height: number): number {
  const pixels = width * height;
  switch (mode) {
    case 'binary':
      return Math.ceil(pixels / 8);
    case '8colors':
      return Math.ceil(pixels / 2);
    case 'truecolor':
      return pixels * 4;
  }
}

/** Where the bit of pixel `(x, y)` lives in Binary mode: LSB first, row-major. */
export function binaryPixelBit(width: number, x: number, y: number): { byte: number; bit: number } {
  const index = y * width + x;
  return { byte: index >> 3, bit: index & 7 };
}

/**
 * The color of pixel `(x, y)` read from memory at `address` (`VGA.updateValue`).
 * `on` is the Binary on color; off pixels are drawn at 20% of it.
 */
export function pixelColor(
  read: ByteReader,
  address: number,
  mode: GraphicsMode,
  width: number,
  x: number,
  y: number,
  on: Rgb,
  off: Rgb = darken(on, OFF_BRIGHTNESS),
): Rgb {
  const index = y * width + x;
  switch (mode) {
    case 'binary': {
      const byte = read(address + (index >> 3));
      return ((byte >> (index & 7)) & 1) === 1 ? on : off;
    }
    case '8colors': {
      const nibble = (read(address + (index >> 1)) >> ((index & 1) * 4)) & 0xf;
      return { r: nibble & 1 ? 255 : 0, g: nibble & 2 ? 255 : 0, b: nibble & 4 ? 255 : 0 };
    }
    case 'truecolor': {
      const base = address + index * 4;
      return { r: read(base), g: read(base + 1), b: read(base + 2) };
    }
  }
}

/** All pixels row-major as RGBA bytes (an `ImageData` buffer). */
export function renderPixels(read: ByteReader, device: GraphicsDevice): Uint8ClampedArray {
  const { width, height, mode, address } = device;
  const on = DEVICE_COLORS[device.color];
  const off = darken(on, OFF_BRIGHTNESS);
  const data = new Uint8ClampedArray(width * height * 4);
  let i = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { r, g, b } = pixelColor(read, address, mode, width, x, y, on, off);
      data[i++] = r;
      data[i++] = g;
      data[i++] = b;
      data[i++] = 255;
    }
  }
  return data;
}

export interface GraphicsLayout {
  readonly background: Rect;
  /** Left and top edge of pixel (0, 0). */
  readonly x0: number;
  readonly y0: number;
  /** Side of one pixel square; 0 when the area is too small to draw any. */
  readonly pixelSize: number;
  /** Gap between pixels: 1, or 0 for pictures wider than 160 or taller than 120. */
  readonly gap: number;
}

/** Geometry in an `areaWidth` x `areaHeight` area, as `VGA.getFactor` and `VGA.paint` compute it. */
export function graphicsLayout(
  areaWidth: number,
  areaHeight: number,
  width: number,
  height: number,
): GraphicsLayout | null {
  if (areaWidth <= 0 || areaHeight <= 0) return null;
  const gap = width > 160 || height > 120 ? 0 : 1;
  const availableWidth = areaWidth - (width + 1) * gap;
  const availableHeight = areaHeight - (height + 1) * gap;
  const pixelSize = Math.max(
    0,
    Math.min(idiv(availableWidth, width + 2), idiv(availableHeight, height + 2)),
  );
  const pitch = pixelSize + gap;
  const x0 = idiv(areaWidth - width * pitch, 2);
  const y0 = idiv(areaHeight - height * pitch, 2);
  const background: Rect = {
    x: x0 - pixelSize,
    y: y0 - pixelSize,
    width: (width + 2) * pitch - 3 * gap,
    height: (height + 2) * pitch - 3 * gap,
  };
  return { background, x0, y0, pixelSize, gap };
}

/** The pixel square of `(x, y)`. */
export function pixelRect(layout: GraphicsLayout, x: number, y: number): Rect {
  const pitch = layout.pixelSize + layout.gap;
  return {
    x: layout.x0 + x * pitch,
    y: layout.y0 + y * pitch,
    width: layout.pixelSize,
    height: layout.pixelSize,
  };
}

/** The pixel under the point `(px, py)` (gaps excluded), or null. */
export function hitPixel(
  layout: GraphicsLayout,
  width: number,
  height: number,
  px: number,
  py: number,
): { x: number; y: number } | null {
  const pitch = layout.pixelSize + layout.gap;
  if (layout.pixelSize === 0) return null;
  const dx = px - layout.x0;
  const dy = py - layout.y0;
  if (dx < 0 || dy < 0) return null;
  const x = Math.floor(dx / pitch);
  const y = Math.floor(dy / pitch);
  if (x >= width || y >= height) return null;
  if (dx - x * pitch >= layout.pixelSize || dy - y * pitch >= layout.pixelSize) return null;
  return { x, y };
}
