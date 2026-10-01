import { DataSpace, LabelSource } from './data-space';
import { ParseError } from './parse-error';
import { ParseResult, Parser } from './parser';

const LABEL_CANDIDATE = /^[ \t]*([^ \t;:']+)[ \t]*:/;

/**
 * The parsed source of one document: one ParseResult per line plus the label
 * definitions (the line model of the original's SyntaxHighlighter, spec 02 §6.5).
 * Every change re-parses the whole text, which spec 02 §6.5 allows.
 */
export class Program implements LabelSource {
  private lines: string[] = [''];
  private parsed: ParseResult[] = [];
  private labelLines = new Map<string, number>();

  constructor(
    readonly dsp: DataSpace,
    readonly parser: Parser = new Parser(dsp),
  ) {
    dsp.labels = this;
    this.reparse();
  }

  get text(): string {
    return this.lines.join('\n');
  }

  /** Lines are split on `\n`; a trailing newline gives a final empty line (spec 04 §9.1). */
  setText(text: string): void {
    this.lines = text.replace(/\r/g, '').split('\n');
    this.reparse();
  }

  get lineCount(): number {
    return this.lines.length;
  }

  line(index: number): string {
    return this.lines[index] ?? '';
  }

  result(index: number): ParseResult {
    return this.parsed[index];
  }

  get results(): readonly ParseResult[] {
    return this.parsed;
  }

  getLabelLine(label: string): number {
    return this.labelLines.get(label) ?? -1;
  }

  /**
   * The label that applies to `index`: the label of the nearest preceding
   * non-empty line if that line is label-only (spec 03 §7).
   */
  lastLabel(index: number): string | null {
    for (let i = index - 1; i >= 0; i--) {
      const r = this.parsed[i];
      if (!r || r.empty) continue;
      return r.labelOnly ? r.label : null;
    }
    return null;
  }

  /**
   * Parses every line twice, so that forward references resolve, like the
   * reference harness (spec 08 §2). Then marks duplicate label definitions.
   */
  reparse(): void {
    this.forgetStaleSymbols();
    this.labelLines = new Map();
    this.parsed = [];
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.lines.length; i++) {
        const result = this.parser.parse(this.lines[i], this.lastLabel(i));
        this.parsed[i] = result;
        if (result.label !== null && !this.labelLines.has(result.label)) {
          this.labelLines.set(result.label, i);
        }
      }
    }
    this.parsed.forEach((result, i) => {
      const definedAt = result.label === null ? i : this.labelLines.get(result.label);
      if (definedAt !== undefined && definedAt !== i) {
        result.error = ParseError.at(
          result.originalLine,
          result.label!,
          0,
          `Label already defined in line ${definedAt}`,
        );
      }
    });
  }

  /** Forgets variables and constants whose label no longer appears in the text. */
  private forgetStaleSymbols(): void {
    const candidates = new Set<string>();
    for (const line of this.lines) {
      const m = LABEL_CANDIDATE.exec(line);
      if (m) candidates.add(m[1].toUpperCase());
    }
    for (const name of this.dsp.getVariableList()) {
      if (!candidates.has(name)) this.dsp.unregisterVariable(name);
    }
    for (const name of this.dsp.getConstantList()) {
      if (!candidates.has(name)) this.dsp.unregisterConstant(name);
    }
  }
}
