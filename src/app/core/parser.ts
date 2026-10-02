import { CalculatedAddress, REGISTER_PATTERN } from './calculated-address';
import { Command } from './command';
import { COMMAND_CLASSES } from './commands';
import { DataSpace, PREFIX_PATTERN } from './data-space';
import { FPU_QUALIFIER_PATTERN, FPU_REGISTER_PATTERN } from './fpu';
import { FullArgument } from './full-argument';
import { NumberFormatError, parseJavaDouble, parseLong } from './java';
import { hex2dec } from './number-literals';
import { Op, getDefinition, matches } from './op';
import { operandSize } from './operand-size';
import { Parameters } from './parameters';
import { ParseError } from './parse-error';

/** The outcome of parsing one source line (port of `ParseResult`). */
export interface ParseResult {
  /** The line upper-cased outside quotes, without CR/LF. */
  readonly originalLine: string;
  readonly empty: boolean;
  readonly label: string | null;
  readonly labelOnly: boolean;
  /** The mnemonic, or null for empty/label-only lines and unknown commands. */
  readonly mnemo: string | null;
  /** Column where a `;` comment starts, or -1. */
  readonly commentStartPos: number;
  readonly usedLabels: ReadonlySet<string>;
  readonly command: Command | null;
  readonly param: Parameters | null;
  error: ParseError | null;
}

export const RUNTIME_STACK_ERROR = 'Memory address out of range. Might be a stack over-/underflow.';

const pMemory = /^\[.*\]$/;
const pDecimal = /^-?\d+$/;
const pFloat = /^-?[0-9]+\.[0-9]*(E[+-]?[0-9]+)?$/;
const pSizeQualifier = /^(BYTE|WORD|DWORD|QWORD)$/;
const pString = /^'.*'$/;

/** Upper-cases everything outside single quotes. */
export function upcase(input: string): string {
  let inside = false;
  let output = '';
  for (const ch of input) {
    if (ch === "'") inside = !inside;
    output += inside || ch === "'" ? ch : ch.toUpperCase();
  }
  return output;
}

/** Protects blanks, commas, `\`, `;` and `:` inside quotes; pads commas outside quotes. */
export function escape(input: string): string {
  const protect: Record<string, string> = {
    ' ': '\\s',
    '\t': '\\t',
    ',': '\\c',
    '\\': '\\b',
    ';': '\\p',
    ':': '\\d',
  };
  let inside = false;
  let output = '';
  for (const ch of input) {
    if (ch === "'") {
      inside = !inside;
      output += ch;
    } else if (inside) {
      output += protect[ch] ?? ch;
    } else {
      output += ch === ',' ? ' , ' : ch;
    }
  }
  return output;
}

export function unescape(input: string): string {
  const restore: Record<string, string> = { s: ' ', t: '\t', c: ',', b: '\\', p: ';', d: ':' };
  let inside = false;
  let escapeNext = false;
  let output = '';
  for (const ch of input) {
    if (ch === "'") {
      inside = !inside;
      output += ch;
    } else if (inside) {
      if (ch === '\\') escapeNext = true;
      else if (escapeNext) {
        output += restore[ch] ?? '';
        escapeNext = false;
      } else output += ch;
    } else {
      output += ch;
    }
  }
  return output;
}

function labelEnd(s: string): number {
  const colon = s.indexOf(':');
  const semicolon = s.indexOf(';');
  return semicolon === -1 || colon < semicolon ? colon : -1;
}

function rawLabel(s: string): string | null {
  const end = labelEnd(s);
  if (end === -1) return null;
  return s.substring(0, end).replace(/^[ \t]+/, '');
}

/**
 * Removes whitespace inside each `[...]` pair separately (07 Q-P-4; the original
 * stripped everything between the first `[` and the last `]`).
 */
function compactBrackets(s: string): string {
  return s.replace(/\[[^\]]*\]/g, (m) => m.replace(/[ \t]/g, ''));
}

/**
 * Parses and executes single lines against one document's machine (port of
 * `jasmin.core.Parser`, spec 03).
 */
export class Parser {
  private readonly commands = new Map<string, Command>();

  constructor(readonly dsp: DataSpace) {
    for (const CommandClass of COMMAND_CLASSES) {
      const command = new CommandClass(dsp);
      for (const mnemonic of command.mnemonics) this.commands.set(mnemonic, command);
    }
  }

  commandExists(mnemonic: string | null): boolean {
    return mnemonic !== null && this.commands.has(mnemonic);
  }

  get mnemonics(): string[] {
    return [...this.commands.keys()];
  }

  /** Parses one line. `lastLabel` is the label of a preceding label-only line, if any. */
  parse(line: string, lastLabelIn: string | null): ParseResult {
    let lastLabel = lastLabelIn;
    const string = upcase(line).replace(/[\r\n]/g, '');
    const result: ParseResult & {
      empty: boolean;
      label: string | null;
      labelOnly: boolean;
      mnemo: string | null;
      commentStartPos: number;
      usedLabels: Set<string>;
      command: Command | null;
      param: Parameters | null;
    } = {
      originalLine: string,
      empty: false,
      label: null,
      labelOnly: false,
      mnemo: null,
      commentStartPos: -1,
      usedLabels: new Set(),
      command: null,
      param: null,
      error: null,
    };
    const fail = (error: ParseError) => {
      result.error = error;
      return result;
    };
    if (/^[ \t]*$/.test(string)) {
      result.empty = true;
      return result;
    }

    let s = escape(string);
    // Comment
    const commentStart = s.indexOf(';');
    if (commentStart !== -1) {
      s = s.substring(0, commentStart);
      result.commentStartPos = commentStart;
      // Undo the comma padding of escape().
      let index = s.indexOf(' , ');
      while (index > -1) {
        result.commentStartPos -= 2;
        index = s.indexOf(' , ', index + 3);
      }
    }
    s = s.trim();

    // Label
    let tokenStartPos = 0;
    if (labelEnd(s) !== -1) {
      const label = this.getLabel(s);
      if (label === null) return fail(ParseError.at(string, rawLabel(s)!, 0, 'Invalid Label'));
      result.label = label;
      lastLabel = label;
      tokenStartPos = labelEnd(s);
      s = s.substring(labelEnd(s) + 1).trim();
    }
    if (/^[, \t]*$/.test(s)) {
      result.labelOnly = true;
      return result;
    }

    const args: FullArgument[] = [];
    let command: string | null = null;
    let commandStart = 0;
    let commaDone = false;
    let nextSize = -1;
    let lastType: number = Op.NULL;
    let sizeExplicit = false;

    s = compactBrackets(s);
    for (const rawToken of s.split(/[ \t]/)) {
      if (rawToken === '') continue;
      const token = unescape(rawToken);
      const argument = hex2dec(token);
      let type = this.getOperandType(argument);
      tokenStartPos = string.indexOf(token, tokenStartPos);
      if (lastType === Op.SIZEQUALI && !matches(type, Op.MEM | Op.IMM | Op.LABEL | Op.VARIABLE)) {
        return fail(
          ParseError.at(
            string,
            token,
            tokenStartPos,
            'Only an immediate or a memory location is allowed after a size qualifier',
          ),
        );
      }
      if (type === Op.COMMA) {
        if (!matches(lastType, Op.PARAM)) {
          return fail(
            ParseError.at(
              string,
              token,
              tokenStartPos,
              'A comma must only be placed after a parameter',
            ),
          );
        }
        commaDone = true;
      }

      if (matches(type, Op.SIZEQUALI)) {
        nextSize = operandSize(token, type, this.dsp);
      } else if (type === Op.COMMA) {
        // Nothing else to do.
      } else if (command === null) {
        command = token;
        result.mnemo = command;
        commandStart = tokenStartPos;
        commaDone = true;
      } else {
        let size = -1;
        if (!commaDone && matches(type, Op.PARAM)) {
          return fail(
            ParseError.at(
              string,
              token,
              tokenStartPos,
              'You must place a comma between any two parameters',
            ),
          );
        }
        if (nextSize !== -1) {
          if (
            matches(type, Op.IMM | Op.CHARS) &&
            operandSize(argument, type, this.dsp) > nextSize
          ) {
            return fail(
              ParseError.at(
                string,
                token,
                tokenStartPos,
                'Operand does not match previous size qualifier.',
              ),
            );
          }
          size = nextSize;
          nextSize = -1;
          sizeExplicit = true;
        } else if (!matches(type, Op.IMM)) {
          size = operandSize(argument, type, this.dsp);
        }
        type = this.getSizedOperandType(argument, type, size);
        args.push(
          new FullArgument(argument, token, tokenStartPos, type, size, sizeExplicit, this.dsp),
        );
        sizeExplicit = false;
        commaDone = type === Op.FPUQUALI;
        // After a prefix, the instruction itself needs no comma.
        if (this.commandExists(argument)) commaDone = true;
      }
      lastType = type;
      tokenStartPos += token.length;
    }

    // A prefix written first: the next token is the instruction.
    if (matches(this.getOperandType(command), Op.PREFIX) && args.length > 0) {
      const prefix = command!;
      command = args[0].arg;
      result.mnemo = command;
      args[0] = new FullArgument(prefix, prefix, 0, Op.PREFIX, -1, false, this.dsp);
      commandStart += prefix.length;
    } else if (args.length > 0 && args[0].address.type === Op.PREFIX) {
      return fail(
        ParseError.forArgument(string, args[0], 'Prefixes must be placed before the command'),
      );
    }

    const cmd = command === null ? undefined : this.commands.get(command);
    if (!cmd) {
      result.mnemo = null;
      return fail(ParseError.at(string, command ?? '', commandStart, 'Unknown command'));
    }

    if (cmd.kind === 'preproc') {
      if (lastLabel === null) {
        return fail(
          ParseError.at(string, command!, 0, 'Preprocessor commands must be preceded by a label.'),
        );
      }
      this.dsp.registerConstant(lastLabel);
    } else if (cmd.kind === 'pseudo') {
      if (lastLabel !== null) this.dsp.registerVariable(lastLabel);
    } else if (lastLabel !== null) {
      this.dsp.unregisterConstant(lastLabel);
      this.dsp.unregisterVariable(lastLabel);
    }

    if (!cmd.overrideMaxMemAccess(command!)) {
      let memoryAccesses = 0;
      for (const a of args) {
        if (a.address.type & Op.MEM) memoryAccesses++;
        if (memoryAccesses > 1) {
          return fail(ParseError.forArgument(string, a, 'Only one memory access allowed.'));
        }
      }
    }

    const param = new Parameters(this.dsp);
    param.set(string, command!, args, cmd.defaultSize(command!), cmd.signed());
    if (lastLabel !== null) param.label = lastLabel;
    for (const a of args) for (const label of a.usedLabels) result.usedLabels.add(label);

    for (const a of args) {
      const message = this.isValidOperand(a, false);
      if (message !== null) return fail(ParseError.forArgument(string, a, message));
    }

    const error = cmd.validate(param);
    if (error) return fail(error);

    result.command = cmd;
    result.param = param;
    if (cmd.kind === 'preproc') cmd.execute(param);
    return result;
  }

  /**
   * Parses and executes one line (uncached `Parser.execute`). Returns a parse or
   * runtime error, or null.
   */
  /**
   * Parses and executes one line (`Parser.execute` with `lineNumber == -1`). A line
   * that runs an instruction advances the change counter (spec 04 §8) unless the
   * instruction failed with an exception-type error.
   */
  execute(line: string, lastLabel: string | null): ParseError | null {
    return this.executeParsed(this.parse(line, lastLabel), true);
  }

  /** Validates the operands of a parsed line against the current state and executes it. */
  executeParsed(parsed: ParseResult, advanceCounter: boolean): ParseError | null {
    if (parsed.error) return parsed.error;
    if (parsed.empty || parsed.labelOnly || !parsed.command || !parsed.param) return null;
    const param = parsed.param;
    for (let i = 0; i < param.numArguments; i++) {
      const message = this.isValidOperand(param.argument(i), true);
      if (message !== null)
        return ParseError.forArgument(parsed.originalLine, param.argument(i), message);
    }
    return this.run(parsed.command, param, advanceCounter);
  }

  /**
   * Executes an already parsed instruction. Run uses this for its cached lines and
   * advances the change counter once at the end instead (`advanceCounter = false`).
   */
  run(command: Command, param: Parameters, advanceCounter = false): ParseError | null {
    return this.checkResult(command.execute(param), advanceCounter);
  }

  /** The end of `run`: `error` is what the instruction returned. */
  checkResult(error: ParseError | null | void, advanceCounter: boolean): ParseError | null {
    if (error) {
      this.dsp.clearAddressOutOfRange();
      return error;
    }
    if (advanceCounter) this.dsp.updateDirty();
    if (this.dsp.addressOutOfRange()) {
      this.dsp.clearAddressOutOfRange();
      return ParseError.runtime(RUNTIME_STACK_ERROR);
    }
    return null;
  }

  /** `Parser.getLabel`: the label before `:` if it is a valid label name, else null. */
  getLabel(s: string): string | null {
    const label = rawLabel(s.toUpperCase());
    if (label === null || /[ \t']/.test(label)) return null;
    const type = this.getOperandType(label);
    return matches(type, Op.ERROR | Op.LABEL | Op.VARIABLE | Op.CONST) ? label : null;
  }

  getSizedOperandType(operand: string, unsizedType: number, size: number): number {
    if (matches(unsizedType, Op.MEM)) return getDefinition(Op.MEM, size);
    if (matches(unsizedType, Op.FLOAT)) {
      const value = parseJavaDouble(operand);
      return Number.isNaN(value) ? Op.ERROR : Op.FLOAT;
    }
    return unsizedType;
  }

  /** Classifies an operand (spec 03 §4). */
  getOperandType(operand: string | null): number {
    if (operand === null || operand === '') return Op.NULL;
    if (operand === ',') return Op.COMMA;
    if (pMemory.test(operand)) return Op.MU;
    if (REGISTER_PATTERN.test(operand))
      return getDefinition(Op.REG, this.dsp.getRegisterSize(operand));
    if (pDecimal.test(operand)) {
      let value: bigint;
      try {
        value = parseLong(operand);
      } catch (error) {
        if (error instanceof NumberFormatError) return Op.ERROR;
        throw error;
      }
      return getDefinition(Op.IMM, operandSize(value.toString(), Op.IMM, this.dsp));
    }
    if (pFloat.test(operand)) return Number.isNaN(parseJavaDouble(operand)) ? Op.ERROR : Op.FLOAT;
    if (this.dsp.isVariable(operand)) return Op.VARIABLE;
    if (this.dsp.isConstant(operand)) return Op.CONST;
    if (this.dsp.labels.getLabelLine(operand) !== -1) return Op.LABEL;
    if (pSizeQualifier.test(operand)) return Op.SIZEQUALI;
    if (PREFIX_PATTERN.test(operand)) return Op.PREFIX;
    if (pString.test(operand)) return operand.length <= 6 ? Op.CHARS : Op.STRING;
    if (FPU_REGISTER_PATTERN.test(operand)) return Op.FPUREG;
    if (FPU_QUALIFIER_PATTERN.test(operand)) return Op.FPUQUALI;
    return Op.ERROR;
  }

  isValidOperand(operand: FullArgument, executeNow: boolean): string | null {
    if (operand.address.type === Op.ERROR) return 'Invalid Expression';
    if (operand.address.type & Op.MEM)
      return this.isValidAddress(operand.arg, operand.address.size, executeNow);
    return null;
  }

  isValidAddress(s: string, size: number, executeNow: boolean): string | null {
    const address = new CalculatedAddress(this.dsp);
    return address.readFromString(s) ?? address.isValid(size === -1 ? 1 : size, executeNow);
  }
}
