import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';

/** Width of the divider's hit area (spec 02 §5: 3 px dividers). */
const DIVIDER = 3;
/** Smallest size either side can be dragged to. */
const MIN_PANE = 40;

/**
 * Two panes with a draggable divider, like a Swing JSplitPane with continuous
 * layout. `position` is the size of the first pane in px (the divider location);
 * null means `defaultPosition(containerSize)`. `committed` fires after a drag or
 * keyboard move so the caller can persist the location.
 */
@Component({
  selector: 'app-split-pane',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.column]': "direction() === 'column'",
  },
  template: `
    <div class="pane first" [style.flex-basis.px]="size()">
      <ng-content select="[first]" />
    </div>
    <div
      class="divider"
      role="separator"
      tabindex="0"
      [class.dragging]="dragging()"
      [attr.aria-orientation]="direction() === 'row' ? 'vertical' : 'horizontal'"
      [attr.aria-valuenow]="size()"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="containerSize()"
      [attr.aria-label]="label()"
      (pointerdown)="startDrag($event)"
      (keydown)="onKey($event)"
    ></div>
    <div class="pane second">
      <ng-content select="[second]" />
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: row;
      width: 100%;
      height: 100%;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    :host(.column) {
      flex-direction: column;
    }
    .pane {
      position: relative;
      display: flex;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    .pane > ::ng-deep * {
      flex: 1;
      min-width: 0;
      min-height: 0;
    }
    .first {
      flex: 0 0 auto;
    }
    .second {
      flex: 1 1 0;
    }
    .divider {
      position: relative;
      flex: 0 0 3px;
      cursor: col-resize;
      touch-action: none;
    }
    :host(.column) > .divider {
      cursor: row-resize;
    }
    .divider::after {
      content: '';
      position: absolute;
      inset: 0 1px;
      background: transparent;
    }
    :host(.column) > .divider::after {
      inset: 1px 0;
    }
    .divider:hover::after,
    .divider.dragging::after,
    .divider:focus-visible::after {
      background: var(--accent);
    }
  `,
})
export class SplitPane {
  /** `row`: side by side (Swing HORIZONTAL_SPLIT); `column`: stacked. */
  readonly direction = input<'row' | 'column'>('row');
  readonly position = model<number | null>(null);
  readonly defaultPosition = input<(containerSize: number) => number>((size) => size / 2);
  readonly label = input('Resize');
  readonly committed = output<number>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly containerSize = signal(0);
  protected readonly dragging = signal(false);

  /** The effective first-pane size, clamped to the container. */
  protected readonly size = computed(() => {
    const total = this.containerSize();
    const wanted = this.position() ?? Math.round(this.defaultPosition()(total));
    if (total <= 0) return Math.max(0, wanted);
    const max = Math.max(0, total - DIVIDER - MIN_PANE);
    return Math.min(Math.max(wanted, Math.min(MIN_PANE, max)), max);
  });

  constructor() {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => this.measure());
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  private measure(): void {
    const rect = this.host.nativeElement.getBoundingClientRect();
    const size = this.direction() === 'row' ? rect.width : rect.height;
    // Hidden tabs measure 0; keep the last real size so positions survive.
    if (size > 0) this.containerSize.set(Math.round(size));
  }

  protected startDrag(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    const divider = event.currentTarget as HTMLElement;
    divider.setPointerCapture(event.pointerId);
    const row = this.direction() === 'row';
    const startCoord = row ? event.clientX : event.clientY;
    const startSize = this.size();
    this.dragging.set(true);

    const move = (e: PointerEvent) => {
      const delta = (row ? e.clientX : e.clientY) - startCoord;
      this.position.set(startSize + delta);
    };
    const end = () => {
      divider.removeEventListener('pointermove', move);
      divider.removeEventListener('pointerup', end);
      divider.removeEventListener('pointercancel', end);
      this.dragging.set(false);
      this.commit();
    };
    divider.addEventListener('pointermove', move);
    divider.addEventListener('pointerup', end);
    divider.addEventListener('pointercancel', end);
  }

  protected onKey(event: KeyboardEvent): void {
    const row = this.direction() === 'row';
    const step = event.shiftKey ? 50 : 10;
    const keys: Record<string, number> = row
      ? { ArrowLeft: -step, ArrowRight: step }
      : { ArrowUp: -step, ArrowDown: step };
    const delta = keys[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    this.position.set(this.size() + delta);
    this.commit();
  }

  private commit(): void {
    const size = this.size();
    this.position.set(size);
    this.committed.emit(size);
  }
}
