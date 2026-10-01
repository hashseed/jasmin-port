import { CdkContextMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, inject, input, viewChild } from '@angular/core';
import {
  LAMP_COLOR,
  MAX_BARS,
  MIN_BARS,
  OFF_BRIGHTNESS,
  BACKGROUND_BRIGHTNESS,
  Point,
  StripLightLayout,
  cssColor,
  darken,
  describeLamps,
  hitLamp,
  lampLit,
  readBytes,
  stripLightLayout,
  toggleMemoryBit,
} from '../../devices';
import { DocumentStore } from '../../services/document-store';
import { DeviceCanvas, DevicePainter, fillRect } from './device-canvas';
import { DeviceDialogs, DeviceMenu, DeviceMenuItem, repaintOnChange } from './device-support';

const LAMP_ON = cssColor(LAMP_COLOR);
const LAMP_OFF_RGB = darken(LAMP_COLOR, OFF_BRIGHTNESS);
const LAMP_OFF = cssColor(LAMP_OFF_RGB);
/** As in StripLight.java, the background is 10% of the *off* color. */
const LAMP_BACKGROUND = cssColor(darken(LAMP_OFF_RGB, BACKGROUND_BRIGHTNESS));

/** The StripLight tab (spec 06 §2). */
@Component({
  selector: 'app-strip-light-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DeviceCanvas, DeviceMenu, CdkContextMenuTrigger],
  template: `
    <app-device-canvas
      label="StripLight lamps"
      [painter]="painter"
      [cdkContextMenuTriggerFor]="menu"
      (hit)="toggle($event)"
    />
    <ng-template #menu><app-device-menu label="StripLight" [items]="menuItems" /></ng-template>
  `,
  styles: `
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
    }
  `,
})
export class StripLightView {
  readonly doc = input.required<DocumentStore>();
  private readonly canvas = viewChild.required(DeviceCanvas);
  private readonly dialogs = inject(DeviceDialogs);
  private layout: StripLightLayout | null = null;

  protected readonly menuItems: readonly DeviceMenuItem[] = [
    { label: 'Change address', run: () => void this.changeAddress() },
    // The original's menu says "digits" here too (spec 06 §2).
    { label: 'Change digits', run: () => void this.changeBars() },
  ];

  constructor() {
    repaintOnChange(this.doc, 'StripLight', () => this.canvas().invalidate());
  }

  private get device() {
    return this.doc().devices.stripLight;
  }

  protected readonly painter: DevicePainter = (ctx, width, height) => {
    const { devices } = this.doc();
    const { address, bars, byteCount } = this.device;
    const bytes = readBytes(devices.read, address, byteCount);
    const layout = stripLightLayout(width, height, bars);
    this.layout = layout;
    if (layout) {
      fillRect(ctx, layout.background, LAMP_BACKGROUND);
      for (const { lamp, rect } of layout.lamps) {
        fillRect(ctx, rect, lampLit(bytes, lamp) ? LAMP_ON : LAMP_OFF);
      }
    }
    return describeLamps(bytes, bars);
  };

  protected toggle({ x, y }: Point): void {
    const shape = this.layout && hitLamp(this.layout, x, y);
    if (!shape) return;
    const doc = this.doc();
    const { address, byteCount } = this.device;
    if (toggleMemoryBit(doc.devices.dataSpace, address, byteCount, shape.lamp)) doc.refreshPanels();
  }

  private async changeAddress(): Promise<void> {
    const doc = this.doc();
    const address = await this.dialogs.address(doc, this.device.address);
    if (address !== null) this.device.address = address;
    doc.devices.refresh();
  }

  private async changeBars(): Promise<void> {
    const bars = await this.dialogs.count(
      `Please enter the number of bars: (${MIN_BARS}-${MAX_BARS})`,
      this.device.bars,
      MIN_BARS,
      MAX_BARS,
    );
    if (bars !== null) this.device.bars = bars;
    this.doc().devices.refresh();
  }
}
