import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import {
  BACKGROUND_BRIGHTNESS,
  DEVICE_COLORS,
  MAX_DIGITS,
  MIN_DIGITS,
  OFF_BRIGHTNESS,
  Point,
  SevenSegmentLayout,
  cssColor,
  darken,
  describeDigits,
  hitSegment,
  readBytes,
  segmentLit,
  sevenSegmentLayout,
  toggleMemoryBit,
} from '../../devices';
import { DocumentStore } from '../../services/document-store';
import { DeviceCanvas, DevicePainter, fillPolygon, fillRect } from './device-canvas';
import { DeviceDialogs, DeviceMenu, DeviceMenuItem, repaintOnChange } from './device-support';

/** The 7-Segment tab (spec 06 §1). */
@Component({
  selector: 'app-seven-segment-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeviceCanvas, DeviceMenu, CdkContextMenuTrigger],
  template: `
    <app-device-canvas
      label="7-Segment display"
      [painter]="painter"
      [cdkContextMenuTriggerFor]="menu"
      (hit)="toggle($event)"
    />
    <ng-template #menu><app-device-menu label="7-Segment" [items]="menuItems" /></ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class SevenSegmentView {
  readonly doc = input.required<DocumentStore>();
  private readonly canvas = viewChild.required(DeviceCanvas);
  private readonly dialogs = inject(DeviceDialogs);
  private layout: SevenSegmentLayout | null = null;

  protected readonly menuItems: readonly DeviceMenuItem[] = [
    { label: 'Change address', run: () => void this.changeAddress() },
    { label: 'Change digits', run: () => void this.changeDigits() },
    { label: 'Change color', run: () => void this.changeColor() },
  ];

  constructor() {
    repaintOnChange(this.doc, '7-Segment', () => this.canvas().invalidate());
  }

  private get device() {
    return this.doc().devices.sevenSegment;
  }

  protected readonly painter: DevicePainter = (ctx, width, height) => {
    const { devices } = this.doc();
    const { address, digits, color } = this.device;
    const layout = sevenSegmentLayout(width, height, digits);
    this.layout = layout;
    const bytes = readBytes(devices.read, address, digits);
    if (!layout) return describeDigits(bytes);
    const on = DEVICE_COLORS[color];
    const lit = cssColor(on);
    const dark = cssColor(darken(on, OFF_BRIGHTNESS));
    fillRect(ctx, layout.background, cssColor(darken(on, BACKGROUND_BRIGHTNESS)));
    for (const { digit, segment, polygon } of layout.segments) {
      fillPolygon(ctx, polygon, segmentLit(bytes[digit], segment) ? lit : dark);
    }
    return describeDigits(bytes);
  };

  protected toggle({ x, y }: Point): void {
    const shape = this.layout && hitSegment(this.layout, x, y);
    if (!shape) return;
    const doc = this.doc();
    const { address, digits } = this.device;
    const bit = shape.digit * 8 + shape.segment;
    if (toggleMemoryBit(doc.devices.dataSpace, address, digits, bit)) doc.refreshPanels();
  }

  private async changeAddress(): Promise<void> {
    const doc = this.doc();
    const address = await this.dialogs.address(doc, this.device.address);
    if (address !== null) this.device.address = address;
    doc.devices.refresh();
  }

  private async changeDigits(): Promise<void> {
    const digits = await this.dialogs.count(
      `Please enter the number of digits: (${MIN_DIGITS}-${MAX_DIGITS})`,
      this.device.digits,
      MIN_DIGITS,
      MAX_DIGITS,
    );
    if (digits !== null) this.device.digits = digits;
    this.doc().devices.refresh();
  }

  private async changeColor(): Promise<void> {
    const color = await this.dialogs.color();
    if (color !== null) this.device.color = color;
    this.doc().devices.refresh();
  }
}
