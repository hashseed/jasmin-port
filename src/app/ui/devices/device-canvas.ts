import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { Point, Polygon, Rect } from '../../devices';

/**
 * Draws a device into `width` x `height` CSS pixels. Returns a short text form of
 * what is shown (exposed as `data-state` for tests and as the accessible
 * description), or null.
 */
export type DevicePainter = (
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
) => string | null;

/**
 * A canvas filling its host that repaints at most once per animation frame
 * (spec 06 port note) and on resize, at the device pixel ratio. Left clicks are
 * reported in CSS pixels relative to the canvas.
 */
@Component({
  selector: 'app-device-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<canvas
    #canvas
    role="img"
    [attr.aria-label]="label()"
    (click)="click($event)"
  ></canvas>`,
  styles: `
    :host {
      position: relative;
      display: block;
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
  `,
})
export class DeviceCanvas {
  readonly label = input.required<string>();
  readonly painter = input.required<DevicePainter>();
  /** A left click at a point of the canvas, in CSS pixels. */
  readonly hit = output<Point>();

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame: number | null = null;
  private ready = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      this.ready = true;
      const observer =
        typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.invalidate());
      observer?.observe(this.host);
      destroyRef.onDestroy(() => observer?.disconnect());
      this.invalidate();
    });
    destroyRef.onDestroy(() => {
      if (this.frame !== null) cancelAnimationFrame(this.frame);
      this.frame = null;
      this.ready = false;
    });
  }

  /** Schedules a repaint for the next animation frame; repeated calls coalesce. */
  invalidate(): void {
    if (!this.ready || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.paint();
    });
  }

  /** Repaints right away. */
  paint(): void {
    const canvas = this.canvasRef().nativeElement;
    const width = Math.floor(this.host.clientWidth);
    const height = Math.floor(this.host.clientHeight);
    const ratio = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const state = this.painter()(ctx, width, height);
    if (state === null) canvas.removeAttribute('data-state');
    else canvas.setAttribute('data-state', state);
  }

  protected click(event: MouseEvent): void {
    if (event.button !== 0) return;
    const bounds = this.canvasRef().nativeElement.getBoundingClientRect();
    this.hit.emit({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
  }
}

export function fillRect(ctx: CanvasRenderingContext2D, rect: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
}

export function fillPolygon(ctx: CanvasRenderingContext2D, polygon: Polygon, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  polygon.forEach(({ x, y }, i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}
