/**
 * Keyboard navigation of a tab strip or toolbar with a roving tab stop (WAI-ARIA
 * Authoring Practices): the arrow keys of the strip's orientation move to the
 * previous or next item, wrapping around; Home and End go to the ends. Returns the
 * new index, or null when the key is not a navigation key (or there are no items).
 */
export function rovingIndex(
  event: KeyboardEvent,
  current: number,
  count: number,
  orientation: 'horizontal' | 'vertical',
): number | null {
  if (count === 0 || event.altKey || event.ctrlKey || event.metaKey) return null;
  const [prev, next] =
    orientation === 'horizontal' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
  switch (event.key) {
    case prev:
      return (Math.max(current, 0) - 1 + count) % count;
    case next:
      return (current + 1) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
