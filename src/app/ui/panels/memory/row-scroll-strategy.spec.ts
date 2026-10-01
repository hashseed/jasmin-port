import { MAX_SPACER_PX, rowWindow, scrollTopForRow, spacerHeight } from './row-scroll-strategy';

const H = 20;

describe('row window', () => {
  it('is the plain row math while the spacer fits', () => {
    expect(spacerHeight(1024, H)).toBe(20480);
    expect(rowWindow(0, 400, 1024, H, 0)).toEqual({ start: 0, end: 21, offset: 0 });
    expect(rowWindow(200, 400, 1024, H, 0)).toEqual({ start: 10, end: 31, offset: 200 });
    // Half a row scrolled: the first row is drawn half hidden.
    expect(rowWindow(210, 400, 1024, H, 0)).toEqual({ start: 10, end: 31, offset: 200 });
    expect(rowWindow(210, 400, 1024, H, 4)).toEqual({ start: 6, end: 35, offset: 120 });
  });

  it('ends exactly at the last row', () => {
    const total = spacerHeight(1024, H);
    const window = rowWindow(total - 400, 400, 1024, H, 4);
    expect(window.end).toBe(1024);
    expect(window.offset + (window.end - window.start) * H).toBe(total);
  });

  it('scales scroll positions for millions of rows', () => {
    const rows = 4 * 1024 * 1024;
    expect(spacerHeight(rows, H)).toBe(MAX_SPACER_PX);
    const bottom = rowWindow(MAX_SPACER_PX - 600, 600, rows, H, 4);
    expect(bottom.end).toBe(rows);
    expect(bottom.offset + (bottom.end - bottom.start) * H).toBeCloseTo(MAX_SPACER_PX, 6);
    const middle = rowWindow((MAX_SPACER_PX - 600) / 2, 600, rows, H, 0);
    expect(Math.abs(middle.start - rows / 2)).toBeLessThan(20);
    // Never draws past the spacer.
    for (const top of [0, 1000, MAX_SPACER_PX / 3, MAX_SPACER_PX - 700, MAX_SPACER_PX - 601]) {
      const w = rowWindow(top, 600, rows, H);
      expect(w.offset + (w.end - w.start) * H).toBeLessThanOrEqual(MAX_SPACER_PX + 1e-6);
      expect(w.end - w.start).toBeGreaterThanOrEqual(30);
    }
  });

  it('inverts to the scroll position of a row', () => {
    expect(scrollTopForRow(10, 400, 1024, H)).toBeCloseTo(200);
    const rows = 4 * 1024 * 1024;
    const top = scrollTopForRow(rows / 2, 600, rows, H);
    expect(rowWindow(top, 600, rows, H, 0).start).toBe(rows / 2);
  });

  it('handles empty and tiny tables', () => {
    expect(rowWindow(0, 400, 0, H)).toEqual({ start: 0, end: 0, offset: 0 });
    expect(rowWindow(50, 400, 3, H)).toEqual({ start: 0, end: 3, offset: 0 });
  });
});
