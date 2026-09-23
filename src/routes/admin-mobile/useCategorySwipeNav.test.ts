import { describe, expect, it } from 'vitest';
import { hasHorizontalScrollRoom } from './useCategorySwipeNav';

// Regression for the reported "swipe entre categorias não funciona" bug:
// the swipe used to bail out permanently the instant a touch started inside
// any horizontally-scrollable ancestor (the day-of-month strip in
// MetricsFilterBar, the sales table), even when that ancestor had nowhere
// left to scroll — which on a category screen dominated by one of those
// widgets made the swipe feel completely dead. hasHorizontalScrollRoom is
// the fix: it only lets the inner scroller keep the gesture while it can
// actually still move that way.
function el(scrollLeft: number, clientWidth: number, scrollWidth: number): HTMLElement {
  return { scrollLeft, clientWidth, scrollWidth } as HTMLElement;
}

describe('hasHorizontalScrollRoom', () => {
  it('has room to scroll left (dx < 0) when not yet at the right edge', () => {
    // 700px of content, 300px visible, nothing scrolled yet.
    expect(hasHorizontalScrollRoom(el(0, 300, 700), -10)).toBe(true);
  });

  it('has no room to scroll further left once already at the right edge', () => {
    expect(hasHorizontalScrollRoom(el(400, 300, 700), -10)).toBe(false);
  });

  it('has no room to scroll right (dx > 0) when already at the left edge', () => {
    // This is the common real-world case: a table/strip the ADM never
    // touched yet is always scrollLeft === 0, so the very first swipe
    // attempt (whichever direction) should fall through to category nav
    // instead of being silently swallowed.
    expect(hasHorizontalScrollRoom(el(0, 300, 700), 10)).toBe(false);
  });

  it('has room to scroll right once scrolled away from the left edge', () => {
    expect(hasHorizontalScrollRoom(el(200, 300, 700), 10)).toBe(true);
  });

  it('has no room in either direction when the element does not actually overflow', () => {
    expect(hasHorizontalScrollRoom(el(0, 300, 300), -10)).toBe(false);
    expect(hasHorizontalScrollRoom(el(0, 300, 300), 10)).toBe(false);
  });
});
