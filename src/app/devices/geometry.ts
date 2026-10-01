export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Polygon = readonly Point[];

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Even-odd point-in-polygon test, like `java.awt.Polygon.contains`. */
export function polygonContains(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Whether `(x, y)` lies in the half-open rectangle, like `java.awt.Rectangle.contains`. */
export function rectContains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/** Java's `int / int`: division truncating toward zero. */
export const idiv = (a: number, b: number): number => Math.trunc(a / b);

/** Java's `Math.round(float)`. */
export const roundFloat = (value: number): number => Math.floor(Math.fround(value) + 0.5);
