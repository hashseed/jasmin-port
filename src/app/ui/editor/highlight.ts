import { ParseResult } from '../../core';
import { ALL_REGISTER_NAMES } from '../../core/registers';

/** Highlight styles of spec 02 §6.3; each maps to a `jas-<style>` CSS class. */
export type HighlightStyle =
  'mnemonic' | 'register' | 'label' | 'variable' | 'constant' | 'error' | 'comment';

/** The kind a label currently has in the machine (spec 02 §6.3, last paragraph). */
export type LabelKind = 'label' | 'variable' | 'constant';

/** A styled run within one line, in line-relative columns. */
export interface HighlightRun {
  readonly from: number;
  readonly to: number;
  readonly style: HighlightStyle;
}

/** `Parser.DELIM`: the characters that bound a whole token. */
const DELIM = "[\\[\\]+\\-*:.\\t,;' ]";

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const tokenPatterns = new Map<string, RegExp>();

function tokenPattern(keyword: string): RegExp {
  let pattern = tokenPatterns.get(keyword);
  if (!pattern) {
    pattern = new RegExp(`(^|${DELIM})(${escapeRegExp(keyword)})(?=${DELIM}|$)`, 'g');
    tokenPatterns.set(keyword, pattern);
  }
  return pattern;
}

/**
 * Port of `SyntaxHighlighter.highlight` (spec 02 §6.3): computes the style of every
 * character of `line` from its parse result, applying the layers in the original's
 * order (later wins): mnemonic, registers, label definition, used labels, error
 * span, comment. Every match is case-insensitive and on whole tokens. The styles
 * come only from the core parser's result, so highlighting cannot disagree with it.
 */
export function highlightLine(
  line: string,
  result: ParseResult | undefined,
  kindOf: (label: string) => LabelKind,
): HighlightRun[] {
  if (!result || result.empty || line.length === 0) return [];
  const styles: (HighlightStyle | null)[] = new Array<HighlightStyle | null>(line.length).fill(
    null,
  );
  const upper = line.toUpperCase();

  const set = (from: number, to: number, style: HighlightStyle) => {
    for (let i = Math.max(0, from); i < Math.min(to, line.length); i++) styles[i] = style;
  };
  /** `applyStyle`: every whole-token occurrence of `keyword` in `upper` from `offset` on. */
  const apply = (keyword: string, style: HighlightStyle, offset = 0) => {
    const pattern = tokenPattern(keyword);
    const text = upper.substring(offset);
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
      const start = m.index + m[1].length;
      set(offset + start, offset + start + keyword.length, style);
      // Continue right after the keyword, so a shared delimiter can start the next match.
      pattern.lastIndex = start + keyword.length;
    }
  };

  // The original highlights used labels in the line minus its first mnemo.length
  // characters (`line.substring(pr.mnemo.length())`); kept for parity.
  let usedLabelOffset = 0;
  if (result.mnemo !== null) {
    apply(result.mnemo, 'mnemonic');
    usedLabelOffset = result.mnemo.length;
  }
  for (const register of ALL_REGISTER_NAMES) apply(register, 'register');
  if (result.label !== null) apply(result.label, kindOf(result.label));
  for (const label of result.usedLabels) apply(label, kindOf(label), usedLabelOffset);
  const error = result.error;
  if (error && error.length > 0) set(error.startPos, error.startPos + error.length, 'error');
  if (result.commentStartPos > -1) set(result.commentStartPos, line.length, 'comment');

  const runs: HighlightRun[] = [];
  let i = 0;
  while (i < line.length) {
    const style = styles[i];
    let j = i + 1;
    while (j < line.length && styles[j] === style) j++;
    if (style !== null) runs.push({ from: i, to: j, style });
    i = j;
  }
  return runs;
}
