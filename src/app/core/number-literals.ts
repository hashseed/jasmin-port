import { NumberFormatError, parseLong } from './java';

/** Characters that delimit a number literal inside a token (spec 03 §3). */
const DELIM = "[\\[\\]+\\-*:.\\t,;' ]";

interface LiteralForm {
  readonly pattern: RegExp;
  readonly radix: number;
  readonly skipFirst: number;
  readonly skipLast: number;
}

const form = (body: string, radix: number, skipFirst: number, skipLast: number): LiteralForm => ({
  pattern: new RegExp(`(^|${DELIM})(${body})(${DELIM}|$)`, 'g'),
  radix,
  skipFirst,
  skipLast,
});

// Same order as Parser.hex2dec. `$` hex is fixed (07 Q-P-1): the original used the
// literal as a regular expression, so it never matched.
const FORMS: readonly LiteralForm[] = [
  form('0X[0-9A-F]+', 16, 2, 0),
  form('[0-9][0-9A-F]*H', 16, 0, 1),
  form('\\$[0-9][0-9A-F]*', 16, 1, 0),
  form('[01]+B', 2, 0, 1),
  form('[0-7]+O', 8, 0, 1),
  form('[0-7]+Q', 8, 0, 1),
];

/**
 * Converts hex, binary and octal literals inside an upper-cased token to decimal
 * (port of `Parser.hex2dec`). Like the original, each match found in the input
 * replaces the first occurrence of its text, and a literal that does not fit in a
 * signed 64-bit value stops all further conversion.
 */
export function hex2dec(input: string): string {
  let s = input;
  try {
    for (const { pattern, radix, skipFirst, skipLast } of FORMS) {
      const source = s;
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      let from = 0;
      for (;;) {
        pattern.lastIndex = from;
        match = pattern.exec(source);
        if (!match) break;
        const literal = match[2];
        const value = parseLong(literal.substring(skipFirst, literal.length - skipLast), radix);
        s = s.replace(literal, () => value.toString());
        from = match.index + match[1].length + literal.length;
      }
    }
  } catch (error) {
    if (!(error instanceof NumberFormatError)) throw error;
  }
  return s;
}
