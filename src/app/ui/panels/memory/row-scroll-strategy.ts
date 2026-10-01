import { CdkVirtualScrollViewport, VirtualScrollStrategy } from '@angular/cdk/scrolling';
import { Signal, signal } from '@angular/core';
import { Subject } from 'rxjs';

/**
 * Tallest scroll spacer we create. Browsers cap element heights (Firefox near
 * 17.9 M px, Chromium near 33.5 M px), and 4 MiB of memory in 8-bit rows would
 * need about 84 M px, so beyond this height scroll positions are scaled.
 */
export const MAX_SPACER_PX = 8_000_000;

/** Rows rendered above and below the visible ones. */
const BUFFER_ROWS = 6;

export interface RowWindow {
  /** First rendered row. */
  readonly start: number;
  /** One past the last rendered row. */
  readonly end: number;
  /** Where the first rendered row is drawn, in px from the top of the spacer. */
  readonly offset: number;
}

/** Height of the scroll spacer for `rowCount` rows. */
export function spacerHeight(rowCount: number, rowHeight: number): number {
  return Math.min(rowCount * rowHeight, MAX_SPACER_PX);
}

/**
 * The rows to render for a scroll position. Without scaling this is the usual
 * `scrollTop / rowHeight`; with scaling the scroll fraction maps linearly onto
 * the first visible row, and the rendered block is drawn at the scroll position
 * so the viewport always shows whole rows from there on. Both cases share the
 * formula: at the bottom, the last row ends exactly at the viewport's bottom.
 */
export function rowWindow(
  scrollTop: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
  buffer = BUFFER_ROWS,
): RowWindow {
  if (rowCount <= 0) return { start: 0, end: 0, offset: 0 };
  const total = spacerHeight(rowCount, rowHeight);
  const maxScroll = Math.max(0, total - viewportHeight);
  const top = Math.min(Math.max(0, scrollTop), maxScroll);
  const lastFirstRow = Math.max(0, rowCount - viewportHeight / rowHeight);
  const exact = maxScroll > 0 ? (top / maxScroll) * lastFirstRow : 0;
  const first = Math.min(Math.floor(exact), rowCount - 1);
  const start = Math.max(0, first - buffer);
  const visible = Math.ceil(viewportHeight / rowHeight) + 1;
  const offset = Math.max(0, top - (exact - first) * rowHeight - (first - start) * rowHeight);
  // Never draw past the spacer: that would grow the scroll range (scaled case).
  const fits = start + Math.floor((total - offset) / rowHeight + 1e-6);
  const end = Math.min(rowCount, first + visible + buffer, Math.max(fits, first + 1));
  return { start, end, offset };
}

/** The scroll position that shows `row` at the top (inverse of {@link rowWindow}). */
export function scrollTopForRow(
  row: number,
  viewportHeight: number,
  rowCount: number,
  rowHeight: number,
): number {
  const total = spacerHeight(rowCount, rowHeight);
  const maxScroll = Math.max(0, total - viewportHeight);
  const lastFirstRow = Math.max(0, rowCount - viewportHeight / rowHeight);
  if (lastFirstRow === 0) return 0;
  return (Math.min(row, lastFirstRow) / lastFirstRow) * maxScroll;
}

/**
 * A CDK virtual scroll strategy for fixed-height rows that stays usable at
 * millions of rows (see {@link MAX_SPACER_PX}). The component renders the rows of
 * {@link window} itself, so the viewport needs no `*cdkVirtualFor`.
 */
export class RowScrollStrategy implements VirtualScrollStrategy {
  readonly scrolledIndexChange = new Subject<number>();
  private readonly windowState = signal<RowWindow>({ start: 0, end: 0, offset: 0 });
  /** The rows currently rendered. */
  readonly window: Signal<RowWindow> = this.windowState.asReadonly();
  private viewport: CdkVirtualScrollViewport | null = null;
  private rowCount = 0;

  constructor(readonly rowHeight: number) {}

  attach(viewport: CdkVirtualScrollViewport): void {
    this.viewport = viewport;
    this.update();
  }

  detach(): void {
    this.viewport = null;
  }

  /** Sets the number of rows (memory size / cell width). */
  setRowCount(count: number): void {
    if (count === this.rowCount) return;
    this.rowCount = count;
    this.update();
  }

  onContentScrolled(): void {
    this.update();
  }

  onDataLengthChanged(): void {
    // Also called by CdkVirtualScrollViewport.checkViewportSize after a resize.
    this.update();
  }

  onContentRendered(): void {
    // Nothing to measure: rows have a fixed height.
  }

  onRenderedOffsetChanged(): void {
    // The offset is always set by update().
  }

  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    const viewport = this.viewport;
    if (!viewport) return;
    const top = scrollTopForRow(index, viewport.getViewportSize(), this.rowCount, this.rowHeight);
    viewport.scrollToOffset(top, behavior);
  }

  private update(): void {
    const viewport = this.viewport;
    if (!viewport) return;
    viewport.setTotalContentSize(spacerHeight(this.rowCount, this.rowHeight));
    const window = rowWindow(
      viewport.measureScrollOffset('top'),
      viewport.getViewportSize(),
      this.rowCount,
      this.rowHeight,
    );
    viewport.setRenderedRange({ start: window.start, end: window.end });
    viewport.setRenderedContentOffset(window.offset);
    const current = this.windowState();
    if (
      current.start !== window.start ||
      current.end !== window.end ||
      current.offset !== window.offset
    ) {
      this.windowState.set(window);
      this.scrolledIndexChange.next(window.start);
    }
  }
}
