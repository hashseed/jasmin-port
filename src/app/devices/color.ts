/** An opaque RGB color with 0-255 channels. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/** The two "on" colors of the 7-Segment and Graphics displays (spec 06 §1, §4). */
export type ColorChoice = 'blue' | 'jasmin';

export const DEVICE_COLORS: Readonly<Record<ColorChoice, Rgb>> = {
  blue: { r: 64, g: 144, b: 255 },
  jasmin: { r: 248, g: 128, b: 224 },
};

/** StripLight lamp color (spec 06 §2). */
export const LAMP_COLOR: Rgb = { r: 255, g: 255, b: 0 };

/** Brightness of off-state elements, relative to the on color. */
export const OFF_BRIGHTNESS = 0.2;
/** Brightness of the display background, relative to the on color. */
export const BACKGROUND_BRIGHTNESS = 0.1;

/**
 * `darkenColor(c, f)` of the original: each channel times the float `f`, rounded
 * like Java's `Math.round(float)`.
 */
export function darken(color: Rgb, factor: number): Rgb {
  const f = Math.fround(factor);
  const channel = (value: number) => Math.floor(Math.fround(value * f) + 0.5);
  return { r: channel(color.r), g: channel(color.g), b: channel(color.b) };
}

export function cssColor({ r, g, b }: Rgb): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/** The random color choice made when a document is created (spec 06 §1). */
export function randomColor(random: () => number = Math.random): ColorChoice {
  return random() < 0.5 ? 'blue' : 'jasmin';
}
