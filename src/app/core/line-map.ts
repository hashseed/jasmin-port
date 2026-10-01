/**
 * Moves line numbers (breakpoints) through an edit, so that they stay with their
 * line (07 Q-UI-2). The edit is reduced to one changed block between the common
 * leading and trailing lines. Lines before the block keep their number; lines after
 * it shift by the change in line count. A line inside the block keeps its number if
 * the block still reaches it, and is dropped otherwise (its line was deleted).
 */
export function remapLines(
  oldLines: readonly string[],
  newLines: readonly string[],
  lines: Iterable<number>,
): Set<number> {
  const common = Math.min(oldLines.length, newLines.length);
  let prefix = 0;
  while (prefix < common && oldLines[prefix] === newLines[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < common - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  const oldBlockEnd = oldLines.length - suffix;
  const newBlockEnd = newLines.length - suffix;
  const delta = newLines.length - oldLines.length;

  const result = new Set<number>();
  for (const line of lines) {
    if (line < prefix) result.add(line);
    else if (line >= oldBlockEnd) {
      if (line < oldLines.length) result.add(line + delta);
    } else if (line < newBlockEnd) result.add(line);
  }
  return result;
}
