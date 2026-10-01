import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import {
  BACKGROUND_BRIGHTNESS,
  DEVICE_COLORS,
  GRAPHICS_MODE_LABELS,
  GraphicsLayout,
  GraphicsMode,
  OFF_BRIGHTNESS,
  Point,
  binaryPixelBit,
  cssColor,
  darken,
  graphicsLayout,
  hitPixel,
  pixelColor,
  pixelRect,
  toggleMemoryBit,
} from '../../devices';
import { DocumentStore } from '../../services/document-store';
import { DeviceCanvas, DevicePainter, fillRect } from './device-canvas';
import { DeviceDialogs, DeviceMenu, DeviceMenuItem, repaintOnChange } from './device-support';

const MODES = Object.keys(GRAPHICS_MODE_LABELS) as GraphicsMode[];

/** The Graphics tab (spec 06 §4). */
@Component({
  selector: 'app-graphics-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeviceCanvas, DeviceMenu, CdkContextMenuTrigger],
  template: `
    <app-device-canvas
      label="Graphics display"
      [painter]="painter"
      [cdkContextMenuTriggerFor]="menu"
      (hit)="toggle($event)"
    />
    <ng-template #menu><app-device-menu label="Graphics" [items]="menuItems" /></ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class GraphicsView {
  readonly doc = input.required<DocumentStore>();
  private readonly canvas = viewChild.required(DeviceCanvas);
  private readonly dialogs = inject(DeviceDialogs);
  private layout: GraphicsLayout | null = null;

  protected readonly menuItems: readonly DeviceMenuItem[] = [
    { label: 'Change address', run: () => void this.changeAddress() },
    { label: 'Change width', run: () => void this.changeSize('width') },
    { label: 'Change height', run: () => void this.changeSize('height') },
    { label: 'Change color mode', run: () => void this.changeMode() },
    { label: 'Change binary color', run: () => void this.changeColor() },
  ];

  constructor() {
    repaintOnChange(this.doc, 'Graphics', () => this.canvas().invalidate());
  }

  private get device() {
    return this.doc().devices.graphics;
  }

  protected readonly painter: DevicePainter = (ctx, areaWidth, areaHeight) => {
    const { devices } = this.doc();
    const { address, width, height, mode, color } = this.device;
    const layout = graphicsLayout(areaWidth, areaHeight, width, height);
    this.layout = layout;
    const state = `${width}x${height} ${GRAPHICS_MODE_LABELS[mode]}`;
    if (!layout) return state;
    const on = DEVICE_COLORS[color];
    const off = darken(on, OFF_BRIGHTNESS);
    fillRect(ctx, layout.background, cssColor(darken(on, BACKGROUND_BRIGHTNESS)));
    if (layout.pixelSize === 0) return state;
    const styles = new Map<number, string>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const rgb = pixelColor(devices.read, address, mode, width, x, y, on, off);
        const key = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
        let style = styles.get(key);
        if (style === undefined) styles.set(key, (style = cssColor(rgb)));
        fillRect(ctx, pixelRect(layout, x, y), style);
      }
    }
    return state;
  };

  /** Left click toggles a pixel's bit in Binary mode; other modes ignore clicks. */
  protected toggle({ x, y }: Point): void {
    const { address, width, height, mode } = this.device;
    if (mode !== 'binary' || !this.layout) return;
    const pixel = hitPixel(this.layout, width, height, x, y);
    if (!pixel) return;
    const doc = this.doc();
    const { byte, bit } = binaryPixelBit(width, pixel.x, pixel.y);
    if (toggleMemoryBit(doc.devices.dataSpace, address + byte, 1, bit)) doc.refreshPanels();
  }

  private async changeAddress(): Promise<void> {
    const doc = this.doc();
    const address = await this.dialogs.address(doc, this.device.address);
    if (address !== null) this.device.address = address;
    doc.devices.refresh();
  }

  private async changeSize(dimension: 'width' | 'height'): Promise<void> {
    const value = await this.dialogs.count(
      `Please enter the ${dimension} in pixels: (default 16)`,
      this.device[dimension],
      1,
    );
    if (value !== null) this.device[dimension] = value;
    this.doc().devices.refresh();
  }

  private async changeMode(): Promise<void> {
    const mode = await this.dialogs.choose(
      'Choose the color mode:',
      MODES,
      (m) => GRAPHICS_MODE_LABELS[m],
    );
    if (mode !== null) this.device.mode = mode;
    this.doc().devices.refresh();
  }

  private async changeColor(): Promise<void> {
    const color = await this.dialogs.color();
    if (color !== null) this.device.color = color;
    this.doc().devices.refresh();
  }
}
