import type { FullArgument } from './full-argument';

/** A parse or runtime error with the span to underline (port of `ParseError`). */
export class ParseError {
  constructor(
    readonly errorMsg: string,
    readonly startPos: number,
    readonly length: number,
  ) {}

  /** Span = first occurrence of `errorString` in `line` at or after `searchStart`. */
  static at(line: string, errorString: string, searchStart: number, message: string): ParseError {
    return new ParseError(message, line.indexOf(errorString, searchStart), errorString.length);
  }

  static forArgument(line: string, argument: FullArgument, message: string): ParseError {
    return ParseError.at(line, argument.original, argument.startPos, message);
  }

  /** A runtime error without a span. */
  static runtime(message: string): ParseError {
    return new ParseError(message, 0, 0);
  }
}
