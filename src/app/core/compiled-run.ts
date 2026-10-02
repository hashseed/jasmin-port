import { Address } from './address';
import { CalculatedAddress } from './calculated-address';
import { Command, Condition, conditionCode } from './command';
import { Add } from './commands/add';
import { And } from './commands/and';
import { Call } from './commands/call';
import { Inc } from './commands/inc';
import { JasminSleep } from './commands/jasmin-sleep';
import { Jmp } from './commands/jmp';
import { Lea } from './commands/lea';
import { Loop } from './commands/loop';
import { Mov } from './commands/mov';
import { Pop } from './commands/pop';
import { Push } from './commands/push';
import { Ret } from './commands/ret';
import { DataSpace } from './data-space';
import { EVEN_PARITY, Flag } from './flags';
import { Op } from './op';
import { Parameters } from './parameters';
import { ParseError } from './parse-error';
import { RUNTIME_STACK_ERROR } from './parser';

/**
 * Compiled code for Run (spec 04 §9.3, port note). A region is a range of
 * consecutive lines that Run has already parsed (its per-run cache), compiled into
 * one JavaScript function: a `switch` on the line number with one `case` per line,
 * falling through from line to line, so a run can enter at any line. Jumps to a line
 * of the region stay in the function; everything else returns to the run loop.
 *
 * The compiled code has the observable behavior of the run loop executing the same
 * lines one by one:
 * - common instructions (MOV, ADD/ADC/SUB/SBB/CMP, INC/DEC/NEG/NOT,
 *   AND/OR/XOR/TEST, LEA, Jcc/JMP, LOOPcc, PUSH, POP, CALL, RET) run as specialized
 *   code that does what their `execute` does on numbers, with the operands resolved
 *   when compiling;
 *   effective addresses are still computed on every execution (07 Q-I-18);
 * - every other instruction calls its command's `execute` (one call site per line,
 *   so no shared dispatch) and checks the result like `Parser.checkResult`;
 * - it never executes more than `budget` lines: entering at a line needs room for
 *   all lines up to the next jump, and every jump checks the budget again, so a
 *   tight loop returns to the run loop when the budget is used up;
 * - it never runs into a line with a breakpoint (the region knows them; the
 *   interpreter drops its regions when breakpoints change);
 * - on an error EIP is left on the failing line (07 Q-E-1) and the error is stored
 *   in `error`; JASMINSLEEP returns to the run loop, which handles the delay;
 * - EIP holds the next line whenever a called `execute` could read it, and the line
 *   to run next when the function returns. Registers, flags, memory and change
 *   stamps get exactly the values `execute` would give them: the fast paths below
 *   inline `RegisterFile.setNum`, `Memory.setLittleEndian`, `DataSpace.getUpdateNum`
 *   and `DataSpace.setFlagsLazy` and fall back to the methods in every other case
 *   (bytes a memory listener watches, label markers, addresses out of range).
 */
export class CompiledRegion {
  /** The error of the last `run`, if it stopped on one, and its line. */
  error: ParseError | null = null;
  errorLine = -1;
  /**
   * Runs from line `pc` (start..end) for at most `budget` lines and returns the
   * number of lines executed. The caller checks `entryCost(pc) <= budget` first.
   */
  run: (pc: number, budget: number) => number = () => 0;
  /** The generated source, for tests and debugging. */
  source = '';

  constructor(
    readonly start: number,
    readonly end: number,
    /** Lines from each line up to and including the next line that exits or jumps. */
    private readonly cost: Int32Array,
    /** Lines of the region that run as specialized code (the others call `execute`). */
    readonly specializedLines: number,
  ) {}

  /** Lines that `run(pc, ...)` executes before it first checks the budget. */
  entryCost(pc: number): number {
    return this.cost[pc - this.start];
  }
}

/** One line of Run's parse cache: the parsed instruction, or nulls for no instruction. */
export interface RunLine {
  readonly command: Command | null;
  readonly param: Parameters | null;
}

/** Largest region, in lines (keeps the generated functions small enough to optimize). */
export const MAX_REGION_LINES = 200;

/**
 * Compiles lines `start..end` of `lines` (all in the cache). `isBreakpoint` tells
 * which lines the code must not run into.
 */
export function compileRegion(
  dsp: DataSpace,
  lines: readonly (RunLine | undefined)[],
  start: number,
  end: number,
  isBreakpoint: (line: number) => boolean,
): CompiledRegion {
  return new RegionCompiler(dsp, lines, start, end, isBreakpoint).compile();
}

/** Whether Run runs `line` as specialized code (for statistics and tests). */
export function isSpecialized(dsp: DataSpace, line: RunLine): boolean {
  return new RegionCompiler(dsp, [line], 0, 0, () => false).specialize(0, line) !== null;
}

/**
 * Properties the generated code reads or writes besides public members. They are
 * private in TypeScript; `checkInternals` makes sure they exist.
 */
const INTERNALS: readonly [string, readonly string[]][] = [
  [
    'dsp',
    [
      'memInfo',
      'regInfo',
      'lazyFlags',
      'lazySize',
      'lazyA',
      'lazyB',
      'lazyResult',
      'lazySubtrahend',
      'cf',
      'of',
    ],
  ],
  ['memory', ['dirty', 'stamp', 'watchStart', 'watchEnd']],
  ['registers', ['dirty', 'dirtyMask', 'stamp']],
];

function checkInternals(dsp: DataSpace): void {
  const objects: Record<string, object> = {
    dsp,
    memory: dsp.memory,
    registers: dsp.registers,
  };
  for (const [object, names] of INTERNALS) {
    for (const name of names) {
      if (!(name in objects[object])) throw new Error(`compiled-run: ${object}.${name} missing`);
    }
  }
}

/** What a specialized line leaves in the locals for the next line's condition. */
interface FlagState {
  /** The lazy flags it set (`setFlagsLazy`) from the expressions below. */
  readonly lazy: number;
  readonly size: number;
  readonly a: string;
  readonly b: string;
  readonly r: string;
  /** Flags it set to a known value (expression). */
  readonly known: Partial<Record<number, string>>;
}

interface LineCode {
  readonly code: string;
  /** Whether the line transfers control itself (jumps, returns). */
  readonly jumps: boolean;
  /** For a specialized flag-setting line: its flags, for a fused condition. */
  readonly flags?: FlagState;
}

interface Operand {
  readonly kind: 'reg' | 'mem' | 'imm';
  readonly arg: Address;
  /** Static value (imm). */
  readonly value: number;
  /** Name of the Address constant (reg and mem). */
  readonly address: string;
  /** Effective address expression (mem). */
  readonly ea: string;
}

const ADD_FLAGS = Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.CF | Flag.PF;
const INC_FLAGS = Flag.OF | Flag.SF | Flag.ZF | Flag.AF | Flag.PF;
const LOGIC_FLAGS = Flag.SF | Flag.ZF | Flag.PF;
const ALL_FLAGS = ADD_FLAGS;

class RegionCompiler {
  private readonly constants: unknown[] = [];
  private readonly constantNames = new Map<unknown, string>();
  /** Per line: the lines up to the next exit (see `CompiledRegion.cost`). */
  private readonly cost: Int32Array;
  private readonly breakpoint: boolean[] = [];
  private enterableCache: Uint8Array | null = null;

  constructor(
    private readonly dsp: DataSpace,
    private readonly lines: readonly (RunLine | undefined)[],
    private readonly start: number,
    private readonly end: number,
    isBreakpoint: (line: number) => boolean,
  ) {
    this.cost = new Int32Array(end - start + 1);
    for (let line = start; line <= end; line++) this.breakpoint[line - start] = isBreakpoint(line);
  }

  compile(): CompiledRegion {
    checkInternals(this.dsp);
    // Cost first: the code of jumps contains the cost of their targets.
    for (let line = this.end; line >= this.start; line--) {
      const i = line - this.start;
      const stops = jumps(this.lines[line]!) || line === this.end || this.isStop(line + 1);
      this.cost[i] = stops ? 1 : this.cost[i + 1] + 1;
    }
    const cases: string[] = [];
    let specialized = 0;
    let previous: FlagState | undefined;
    for (let line = this.start; line <= this.end; line++) {
      const entry = this.lines[line]!;
      let result: LineCode = { code: '', jumps: false };
      if (entry.command && entry.param) {
        const special = this.specialize(line, entry, previous);
        if (special) specialized++;
        result = special ?? this.generic(line, entry.command, entry.param);
      }
      let body = result.code;
      // A flag-setting line tells a following conditional jump that it ran just before.
      if (result.flags) body += `f = ${line};\n`;
      // Falling into a breakpoint line, or off the region, returns to the run loop.
      if (!result.jumps && (line === this.end || this.isStop(line + 1))) {
        body += `n += ${line} - s + 1; V[8] = ${line + 1}; return n;\n`;
      }
      cases.push(`case ${line}:\n${body}`);
      previous = result.flags;
    }
    const region = new CompiledRegion(this.start, this.end, this.cost, specialized);
    const names = this.constants.map((_, i) => `k${i}`);
    const source =
      `"use strict";\n` +
      (names.length ? `const ${names.map((n, i) => `${n} = K[${i}]`).join(', ')};\n` : '') +
      `return function run(pc, budget) {\n` +
      `let n = 0, s = pc, f = -1, t = 0, a = 0, b = 0, r = 0, c = 0, x = 0, i = 0, w = 0, e = null;\n` +
      `for (;;) {\nswitch (pc) {\n${cases.join('')}default: return n;\n}\n}\n};`;
    const registers = this.dsp.registers;
    const fail = (count: number, line: number, error: ParseError): number => {
      region.error = error;
      region.errorLine = line;
      registers.moveInstructionPointer(line);
      return count;
    };
    const runtimeError = () => ParseError.runtime(RUNTIME_STACK_ERROR);
    const memory = this.dsp.memory as unknown as { dirty: Float64Array };
    const registerFile = registers as unknown as { dirty: Float64Array; dirtyMask: Int32Array };
    const factory = new Function(
      'd',
      'R',
      'V',
      'K',
      'fail',
      'RT',
      'M',
      'B',
      'MD',
      'RD',
      'RM',
      'P',
      source,
    ) as (...args: unknown[]) => (pc: number, budget: number) => number;
    region.run = factory(
      this.dsp,
      registers,
      registers.values,
      this.constants,
      fail,
      runtimeError,
      this.dsp.memory,
      this.dsp.memory.bytes,
      memory.dirty,
      registerFile.dirty,
      registerFile.dirtyMask,
      EVEN_PARITY,
    );
    region.source = source;
    return region;
  }

  /** Whether code must not fall or jump into `line` (outside the region or a breakpoint). */
  private isStop(line: number): boolean {
    return line < this.start || line > this.end || this.breakpoint[line - this.start];
  }

  private constant(value: unknown): string {
    let name = this.constantNames.get(value);
    if (name === undefined) {
      name = `k${this.constants.length}`;
      this.constants.push(value);
      this.constantNames.set(value, name);
    }
    return name;
  }

  // ---- control transfer (after `n` counts the jumping line) ----

  /** Continues at the static line `target`. */
  private goto(target: number): string {
    if (this.isStop(target)) return `d.setInstructionPointer(${target}); return n;\n`;
    const cost = this.cost[target - this.start];
    return (
      `if (n + ${cost} <= budget) { pc = s = ${target}; f = -1; continue; }\n` +
      `d.setInstructionPointer(${target}); return n;\n`
    );
  }

  /** Continues at the line in EIP. */
  private gotoEIP(): string {
    const costs = this.constant(this.cost);
    const enterable = this.constant(this.enterable());
    return (
      `pc = V[8] | 0;\n` +
      `if (pc >= ${this.start} && pc <= ${this.end} && ${enterable}[pc - ${this.start}] === 1 && ` +
      `n + ${costs}[pc - ${this.start}] <= budget) { s = pc; f = -1; continue; }\n` +
      `return n;\n`
    );
  }

  /** Continues with the next line after a conditional jump was not taken. */
  private fallThrough(line: number): string {
    const next = line + 1;
    if (this.isStop(next)) return `V[8] = ${next}; return n;\n`;
    const cost = this.cost[next - this.start];
    return `s = ${next};\nif (n + ${cost} > budget) { V[8] = ${next}; return n; }\n`;
  }

  private enterable(): Uint8Array {
    if (!this.enterableCache) {
      this.enterableCache = new Uint8Array(this.end - this.start + 1);
      for (let k = 0; k < this.enterableCache.length; k++) {
        this.enterableCache[k] = this.breakpoint[k] ? 0 : 1;
      }
    }
    return this.enterableCache;
  }

  // ---- generic lines ----

  /** A line that calls its command's `execute` and checks it like `Parser.checkResult`. */
  private generic(line: number, command: Command, param: Parameters): LineCode {
    const c = this.constant(command);
    const p = this.constant(param);
    let code =
      `V[8] = ${line + 1};\n` +
      `e = ${c}.execute(${p});\n` +
      `if (e) { d.clearAddressOutOfRange(); return fail(n + ${line} - s + 1, ${line}, e); }\n` +
      this.rangeCheck(line);
    if (command instanceof JasminSleep) {
      // The run loop handles the delay.
      return { code: code + `n += ${line} - s + 1; return n;\n`, jumps: true };
    }
    if (!jumps({ command, param })) return { code, jumps: false };
    code += `n += ${line} - s + 1;\n`;
    const target = command instanceof Call ? this.staticTarget(param) : null;
    // A CALL that did not fail jumped to its target.
    code += target === null ? this.gotoEIP() : this.goto(target);
    return { code, jumps: true };
  }

  /** `Parser.checkResult`'s out-of-range test, after a line that may access memory. */
  private rangeCheck(line: number): string {
    return (
      `if (d.addressOutOfRange()) { d.clearAddressOutOfRange(); ` +
      `return fail(n + ${line} - s + 1, ${line}, RT()); }\n`
    );
  }

  /** The jump target of operand 0 if it is a static number (`getNum(0) | 0`). */
  private staticTarget(p: Parameters): number | null {
    if (!p.numeric) return null;
    const a = p.argument(0).address;
    if (a.dynamic || Number.isNaN(a.num)) return null;
    return a.num | 0;
  }

  // ---- specialized lines ----

  /**
   * Specialized code for `entry`, or null if the line calls `execute`. `previous`
   * describes the flags set by the line before, if it is a specialized flag setter.
   */
  specialize(line: number, entry: RunLine, previous?: FlagState): LineCode | null {
    const command = entry.command;
    const p = entry.param;
    if (!command || !p || p.signed || !p.numeric) return null;
    if (command instanceof Jmp) return this.jump(line, p, previous);
    if (command instanceof Loop) return this.loop(line, p, previous);
    if (command instanceof Push) return this.push(line, command, p);
    if (command instanceof Pop) return this.pop(line, command, p);
    if (command instanceof Call) return this.call(line, command, p);
    if (command instanceof Ret) return this.ret(line, command, p);
    const ops: Operand[] = [];
    for (let k = 0; k < p.numArguments; k++) {
      const op = this.operand(p, k);
      if (!op) return null;
      ops.push(op);
    }
    // At most one memory operand: its effective address is computed once.
    const memory = ops.filter((op) => op.kind === 'mem');
    if (memory.length > 1) return null;
    let result: { code: string; flags?: FlagState } | null = null;
    if (command instanceof Mov) result = this.mov(p, ops);
    else if (command instanceof Add) result = this.add(p, ops);
    else if (command instanceof Inc) result = this.inc(p, ops);
    else if (command instanceof And) result = this.and(p, ops);
    else if (command instanceof Lea) result = this.lea(p, ops);
    if (result === null) return null;
    let code = result.code;
    if (memory.length) {
      const m = memory[0];
      code = `x = ${m.ea};\n${m.address}.address = x;\n${code}${this.rangeCheck(line)}`;
    }
    return { code, jumps: false, flags: result.flags };
  }

  /** Operand `k` as `getNum` reads it, or null if it is not a register, memory or number. */
  private operand(p: Parameters, k: number): Operand | null {
    const arg = p.argument(k);
    const a = arg.address;
    if (!a.dynamic) {
      if (Number.isNaN(a.num)) return null;
      return { kind: 'imm', arg: a, value: a.num, address: '', ea: '' };
    }
    if (a.type & Op.REG) {
      if (a.address < 0 || a.address > 7) return null;
      return { kind: 'reg', arg: a, value: 0, address: this.constant(a), ea: '' };
    }
    if (a.type & Op.MEM && arg.cAddress && (a.size === 1 || a.size === 2 || a.size === 4)) {
      const ea = this.effectiveAddress(arg.cAddress);
      return { kind: 'mem', arg: a, value: 0, address: this.constant(a), ea };
    }
    return null;
  }

  /** `calculateEffectiveAddress(true)` of `c`, inline for 32-bit registers. */
  private effectiveAddress(c: CalculatedAddress): string {
    const { base, index, scale, displacement } = c.parts;
    if ((base && base.size !== 4) || (index && index.size !== 4)) {
      return `${this.constant(c)}.calculateEffectiveAddress(true)`;
    }
    const terms: string[] = [];
    if (base) terms.push(`(V[${base.address}] | 0)`);
    if (index) terms.push(`Math.imul(V[${index.address}] | 0, ${scale})`);
    terms.push(`(${displacement})`);
    return `((${terms.join(' + ')}) | 0)`;
  }

  /** Reads `op` into the local `name` as `Parameters.getNum` (unsigned). */
  private load(name: string, op: Operand): string {
    if (op.kind === 'imm') return `${name} = ${op.value};\n`;
    if (op.kind === 'reg') return `${name} = ${registerRead(op.arg)};\n`;
    // `DataSpace.getUpdateNum(a, false)`: inline unless out of range or label markers exist.
    const size = op.arg.size;
    const offset = this.dsp.offset;
    const limit = this.dsp.memoryEnd - size;
    const read = readBytes(size);
    return (
      `if (x >= ${offset} && x <= ${limit} && d.memInfo.size === 0) { i = x - ${offset}; ${name} = ${read}; }\n` +
      `else ${name} = d.getUpdateNum(${op.address}, false);\n`
    );
  }

  /** `putNum(value, op, null)` for a register or memory destination. */
  private store(op: Operand, value: string): string {
    if (op.kind === 'reg') return this.storeRegister(op.arg, value);
    // `Memory.setLittleEndian` without watched bytes, label markers or range errors.
    const size = op.arg.size;
    const offset = this.dsp.offset;
    const limit = this.dsp.memoryEnd - size;
    return (
      `if (x >= ${offset} && x <= ${limit} && d.memInfo.size === 0 && ${unwatched('x', size)}) {\n` +
      this.writeBytes(size, value) +
      `}\nelse d.putNum(${value}, ${op.address}, null);\n`
    );
  }

  /** `putNum(value, a, null)` for a register: `RegisterFile.setNum`, dropping a label marker. */
  private storeRegister(a: Address, value: string): string {
    const k = a.address;
    const write =
      a.mask === 0xffffffff && a.rshift === 0
        ? `V[${k}] = ${value};\n`
        : `V[${k}] = (V[${k}] & ${~a.mask}) | ((${value} << ${a.rshift}) & ${a.mask});\n`;
    return (
      write +
      `RD[${k}] = R.stamp; RM[${k}] = ${a.mask | 0};\n` +
      `if (d.regInfo.size !== 0) d.regInfo.delete(${k});\n`
    );
  }

  /** `Memory.setLittleEndian(x, value, size)` without watched bytes (x checked by the caller). */
  private writeBytes(size: number, value: string): string {
    let code = `i = x - ${this.dsp.offset}; w = ${value};\nB[i] = w; MD[i] = M.stamp;\n`;
    for (let k = 1; k < size; k++) code += `w >>>= 8; B[i + ${k}] = w; MD[i + ${k}] = M.stamp;\n`;
    return code;
  }

  // ---- stack (`Parameters.push` and `pop`) ----
  //
  // Inline when no label markers exist (then the markers that `push` and `pop`
  // copy are all null) and a push writes no watched bytes; otherwise the line
  // calls `execute`.

  /** `Parameters.push` of the local `a` (`size` bytes). */
  private pushValue(size: number): string {
    const offset = this.dsp.offset;
    return (
      `c = V[6] - ${size};\n` +
      this.storeRegister(this.dsp.ESP, 'c') +
      `x = V[6] | 0;\n` +
      `if (x >= ${offset} && x <= ${this.dsp.memoryEnd - size}) {\n${this.writeBytes(size, 'a')}}\n` +
      `else d.setAddressOutOfRange();\n`
    );
  }

  /** `Parameters.pop` into the register `dest` (`size` bytes). */
  private popInto(dest: Address, size: number): string {
    const offset = this.dsp.offset;
    const end = this.dsp.memoryEnd;
    return (
      `c = V[6] + ${size};\n` +
      `if (c > ${end}) d.setAddressOutOfRange();\n` +
      `else {\n` +
      `x = V[6] | 0;\n` +
      `if (x >= ${offset} && x <= ${end - size}) { i = x - ${offset}; a = ${readBytes(size)}; }\n` +
      `else { d.setAddressOutOfRange(); a = 0; }\n` +
      this.storeRegister(dest, 'a') +
      this.storeRegister(this.dsp.ESP, 'c') +
      `}\n`
    );
  }

  /**
   * Fast stack code, else the command's `execute`; then the range check. `pushed`
   * is the size of the value a push writes below ESP (0 for a pop).
   */
  private stack(line: number, command: Command, p: Parameters, fast: string, pushed = 0): string {
    const condition =
      pushed === 0
        ? STACK_FAST
        : `${STACK_FAST} && ${unwatched(`((V[6] - ${pushed}) | 0)`, pushed)}`;
    return (
      `if (${condition}) {\n${fast}} else ${this.constant(command)}.execute(${this.constant(p)});\n` +
      this.rangeCheck(line)
    );
  }

  /** PUSH of a register or a number (`Push.execute`). */
  private push(line: number, command: Command, p: Parameters): LineCode | null {
    const op = this.operand(p, 0);
    if (!op || op.kind === 'mem' || p.numArguments !== 1 || (p.size !== 2 && p.size !== 4)) {
      return null;
    }
    // `execute` sets the operand's size to the operation size: keep to registers of that size.
    if (op.kind === 'reg' && op.arg.size !== p.size) return null;
    const fast = this.load('a', op) + this.pushValue(p.size);
    return { code: this.stack(line, command, p, fast, p.size), jumps: false };
  }

  /** POP into a register (`Pop.execute`). */
  private pop(line: number, command: Command, p: Parameters): LineCode | null {
    const op = this.operand(p, 0);
    if (!op || op.kind !== 'reg' || p.numArguments !== 1) return null;
    const size = op.arg.size;
    if (size !== 2 && size !== 4) return null;
    return { code: this.stack(line, command, p, this.popInto(op.arg, size)), jumps: false };
  }

  /** CALL of a static line (`Call.execute`): push EIP (the next line), then jump. */
  private call(line: number, command: Command, p: Parameters): LineCode | null {
    const target = this.staticTarget(p);
    if (target === null) return null;
    const fast = `a = V[8];\n` + this.pushValue(4) + `d.setInstructionPointer(${target});\n`;
    const code =
      `V[8] = ${line + 1};\n` +
      this.stack(line, command, p, fast, 4) +
      `n += ${line} - s + 1;\n` +
      this.goto(target);
    return { code, jumps: true };
  }

  /** RET (`Ret.execute`): pop EIP, then continue there. */
  private ret(line: number, command: Command, p: Parameters): LineCode | null {
    if (p.numArguments !== 0) return null;
    const code =
      `V[8] = ${line + 1};\n` +
      this.stack(line, command, p, this.popInto(this.dsp.EIP, 4)) +
      `n += ${line} - s + 1;\n` +
      this.gotoEIP();
    return { code, jumps: true };
  }

  /** `DataSpace.setFlagsLazy` inline. */
  private setFlags(state: FlagState, subtrahend: string): string {
    let code = '';
    if (state.lazy !== ALL_FLAGS) {
      code += `w = d.lazyFlags & ${~state.lazy}; if (w !== 0) d.materializeFlags(w);\n`;
    }
    return (
      code +
      `d.lazySize = ${state.size}; d.lazyA = ${state.a}; d.lazyB = ${state.b}; ` +
      `d.lazyResult = ${state.r}; d.lazySubtrahend = ${subtrahend}; d.lazyFlags = ${state.lazy};\n`
    );
  }

  private mov(p: Parameters, ops: Operand[]): { code: string } | null {
    // CMOVcc and labels (which mark the destination) call `execute`.
    if (p.mnemo !== 'MOV' || p.type(1) === Op.LABEL || ops.length !== 2) return null;
    if (ops[0].kind === 'imm') return null;
    return { code: this.load('a', ops[1]) + this.store(ops[0], 'a') };
  }

  private add(p: Parameters, ops: Operand[]): { code: string; flags: FlagState } | null {
    if (ops.length !== 2 || ops[0].kind === 'imm') return null;
    const size = p.size;
    let code = this.load('a', ops[0]) + this.load('b', ops[1]);
    let flags: FlagState;
    switch (p.mnemo) {
      case 'ADD':
        code += `r = a + b;\n`;
        flags = { lazy: ADD_FLAGS, size, a: 'a', b: 'b', r: 'r', known: {} };
        break;
      case 'ADC':
        code += `r = a + b + (d.fCarry ? 1 : 0);\n`;
        flags = { lazy: ADD_FLAGS, size, a: 'a', b: 'b', r: 'r', known: {} };
        break;
      case 'SBB':
        code += `r = a - b - (d.fCarry ? 1 : 0);\n`;
        flags = { lazy: ADD_FLAGS, size, a: 'a', b: '(-b)', r: 'r', known: {} };
        break;
      case 'SUB':
      case 'CMP':
        code += `r = a - b;\n`;
        flags = { lazy: ADD_FLAGS, size, a: 'a', b: '(-b)', r: 'r', known: {} };
        break;
      default:
        return null;
    }
    code += this.setFlags(flags, 'b');
    if (p.mnemo !== 'CMP') code += this.store(ops[0], 'r');
    return { code, flags };
  }

  private inc(p: Parameters, ops: Operand[]): { code: string; flags?: FlagState } | null {
    if (ops.length !== 1 || ops[0].kind === 'imm') return null;
    const size = p.size;
    let code = this.load('a', ops[0]);
    let flags: FlagState | undefined;
    switch (p.mnemo) {
      case 'INC':
        code += `r = a + 1;\n`;
        flags = { lazy: INC_FLAGS, size, a: 'a', b: '1', r: 'r', known: {} };
        code += this.setFlags(flags, '1');
        break;
      case 'DEC':
        code += `r = a - 1;\n`;
        flags = { lazy: INC_FLAGS, size, a: 'a', b: '(-1)', r: 'r', known: {} };
        code += this.setFlags(flags, '1');
        break;
      case 'NEG':
        // 0 + (-a), with the subtrahend a for AF; CF is set afterwards.
        code += `r = -a;\n`;
        flags = { lazy: INC_FLAGS, size, a: '0', b: '(-a)', r: 'r', known: {} };
        code += this.setFlags(flags, 'a') + `d.cf = r !== 0; d.lazyFlags &= ${~Flag.CF};\n`;
        flags = { ...flags, known: { [Flag.CF]: '(r !== 0)' } };
        break;
      case 'NOT':
        code += `r = ~a;\n`;
        break;
      default:
        return null;
    }
    return { code: code + this.store(ops[0], 'r'), flags };
  }

  private and(p: Parameters, ops: Operand[]): { code: string; flags: FlagState } | null {
    if (ops.length !== 2 || ops[0].kind === 'imm') return null;
    const operator = ({ AND: '&', TEST: '&', OR: '|', XOR: '^' } as Record<string, string>)[
      p.mnemo
    ];
    if (!operator) return null;
    const flags: FlagState = {
      lazy: LOGIC_FLAGS,
      size: p.size,
      a: 'a',
      b: 'b',
      r: 'r',
      known: { [Flag.OF]: 'false', [Flag.CF]: 'false' },
    };
    let code =
      this.load('a', ops[0]) +
      this.load('b', ops[1]) +
      `r = a ${operator} b;\n` +
      this.setFlags(flags, 'b') +
      // `fOverflow = false; fCarry = false`
      `d.of = false; d.lazyFlags &= ${~Flag.OF}; d.cf = false; d.lazyFlags &= ${~Flag.CF};\n`;
    if (p.mnemo !== 'TEST') code += this.store(ops[0], 'r');
    return { code, flags };
  }

  private lea(p: Parameters, ops: Operand[]): { code: string } | null {
    const source = p.argument(1).cAddress;
    if (ops.length !== 2 || ops[0].kind !== 'reg' || !source) return null;
    // LEA does not access memory: no range check.
    return { code: `c = ${this.effectiveAddress(source)};\n` + this.store(ops[0], 'c') };
  }

  /** The jump target of operand 0: a static line or a register (`getNum(0) | 0`). */
  private target(p: Parameters): { line: number } | { read: string } | null {
    const fixed = this.staticTarget(p);
    if (fixed !== null) return { line: fixed };
    const op = this.operand(p, 0);
    if (op?.kind === 'reg') return { read: `(${registerRead(op.arg)} | 0)` };
    return null;
  }

  /** Code for a taken jump to `target`. */
  private taken(target: { line: number } | { read: string }): string {
    return 'line' in target
      ? this.goto(target.line)
      : `d.setInstructionPointer(t);\n${this.gotoEIP()}`;
  }

  /** JMP and Jcc (`Jmp.execute`). */
  private jump(line: number, p: Parameters, previous?: FlagState): LineCode | null {
    const target = this.target(p);
    if (!target) return null;
    const condition = p.mnemo === 'JMP' ? Condition.ALWAYS : conditionCode(p.mnemo.substring(1));
    let code = `n += ${line} - s + 1;\n`;
    if ('read' in target) code += `t = ${target.read};\n`;
    const test = this.conditionTest(line, condition, previous);
    if (test === 'true') {
      code += this.taken(target);
    } else {
      code += `if (${test}) {\n${this.taken(target)}}\n${this.fallThrough(line)}`;
    }
    return { code, jumps: true };
  }

  /** LOOP, LOOPE, LOOPNE (`Loop.execute`). */
  private loop(line: number, p: Parameters, previous?: FlagState): LineCode | null {
    const target = this.target(p);
    if (!target) return null;
    const condition = p.mnemo === 'LOOP' ? Condition.ALWAYS : conditionCode(p.mnemo.substring(4));
    const ecx = this.dsp.ECX;
    let code = `n += ${line} - s + 1;\n`;
    if ('read' in target) code += `t = ${target.read};\n`;
    // Java long arithmetic: ECX = 0 gives -1 (stored as 0xFFFFFFFF), which jumps.
    code += `c = ${registerRead(ecx)} - 1;\n`;
    code += this.storeRegister(ecx, 'c');
    const test = this.conditionTest(line, condition, previous);
    code += `if (c !== 0${test === 'true' ? '' : ` && ${test}`}) {\n${this.taken(target)}}\n`;
    code += this.fallThrough(line);
    return { code, jumps: true };
  }

  /**
   * `Command.testCondition` as an expression. When the line before set the flags
   * (`previous`) and execution fell through from it (`f`), the flags come from its
   * locals, as the lazy flags would compute them; otherwise from the flag getters.
   */
  private conditionTest(line: number, condition: number, previous?: FlagState): string {
    const getter = conditionExpression(condition, (flag) => `d.${FLAG_GETTERS[flag]}`);
    if (!previous || getter === 'true' || getter === 'false') return getter;
    const fused = conditionExpression(condition, (flag) => flagFromLocals(flag, previous));
    if (fused === getter) return getter;
    return `(f === ${line - 1} ? ${fused} : ${getter})`;
  }
}

/** Whether a line transfers control itself (or, for JASMINSLEEP, must return). */
function jumps(line: RunLine): boolean {
  const c = line.command;
  return (
    c instanceof Jmp ||
    c instanceof Loop ||
    c instanceof Call ||
    c instanceof Ret ||
    c instanceof JasminSleep
  );
}

const FLAG_GETTERS: Record<number, string> = {
  [Flag.CF]: 'fCarry',
  [Flag.OF]: 'fOverflow',
  [Flag.SF]: 'fSign',
  [Flag.ZF]: 'fZero',
  [Flag.PF]: 'fParity',
};

/**
 * A flag as `DataSpace`'s lazy getters compute it from the operation in `state`,
 * a known value, or the getter if the line did not set it.
 */
function flagFromLocals(flag: number, state: FlagState): string {
  const known = state.known[flag];
  if (known !== undefined) return known;
  if (!(state.lazy & flag)) return `d.${FLAG_GETTERS[flag]}`;
  const bits = state.size * 8;
  const sh = bits - 1;
  const { a, b, r } = state;
  switch (flag) {
    case Flag.CF:
      return bits === 32
        ? `((Math.floor(${r} / 4294967296) & 1) === 1)`
        : `(((${r} >> ${bits}) & 1) === 1)`;
    case Flag.OF:
      return `((((${a} >> ${sh}) & 1) === ((${b} >> ${sh}) & 1)) && (((${r} >> ${sh}) & 1) !== ((${a} >> ${sh}) & 1)))`;
    case Flag.SF:
      return `(((${r} >> ${sh}) & 1) === 1)`;
    case Flag.ZF:
      return bits === 32 ? `((${r} | 0) === 0)` : `((${r} & ${(1 << bits) - 1}) === 0)`;
    case Flag.PF:
      return `(P[${r} & 255] === 1)`;
    default:
      return `d.${FLAG_GETTERS[flag]}`;
  }
}

/** `Command.testCondition` as an expression; `flag` gives each flag's expression. */
function conditionExpression(condition: number, flag: (flag: number) => string): string {
  const CF = () => flag(Flag.CF);
  const OF = () => flag(Flag.OF);
  const SF = () => flag(Flag.SF);
  const ZF = () => flag(Flag.ZF);
  const PF = () => flag(Flag.PF);
  switch (condition) {
    case Condition.O:
      return OF();
    case Condition.NO:
      return `!${OF()}`;
    case Condition.C:
      return CF();
    case Condition.NC:
      return `!${CF()}`;
    case Condition.Z:
      return ZF();
    case Condition.NZ:
      return `!${ZF()}`;
    case Condition.BE:
      return `(${CF()} || ${ZF()})`;
    case Condition.A:
      return `!(${CF()} || ${ZF()})`;
    case Condition.S:
      return SF();
    case Condition.NS:
      return `!${SF()}`;
    case Condition.P:
      return PF();
    case Condition.NP:
      return `!${PF()}`;
    case Condition.L:
      return `(${SF()} !== ${OF()})`;
    case Condition.GE:
      return `(${SF()} === ${OF()})`;
    case Condition.LE:
      return `(${SF()} !== ${OF()} || ${ZF()})`;
    case Condition.G:
      return `!(${SF()} !== ${OF()} || ${ZF()})`;
    case Condition.CXZ:
      return '((V[2] & 65535) === 0)';
    case Condition.ECXZ:
      return '(V[2] === 0)';
    case Condition.ALWAYS:
      return 'true';
    default:
      return 'false';
  }
}

/** Stack code is inline only without label markers (and, for a push, watched bytes). */
const STACK_FAST = 'd.memInfo.size === 0 && d.regInfo.size === 0';

/**
 * Whether no memory listener watches the `size` bytes at `address` (an int32
 * expression): outside the hull of the watched ranges inline, else `isWatched`.
 */
function unwatched(address: string, size: number): string {
  return `(${address} >= M.watchEnd || ${address} + ${size} <= M.watchStart || !M.isWatched(${address}, ${size}))`;
}

/** Unsigned little-endian read of `size` (1, 2 or 4) bytes at `B[i]`. */
function readBytes(size: number): string {
  if (size === 4) return `(B[i] | (B[i + 1] << 8) | (B[i + 2] << 16) | (B[i + 3] << 24)) >>> 0`;
  if (size === 2) return `B[i] | (B[i + 1] << 8)`;
  return `B[i]`;
}

/** `RegisterFile.get(a)` as an expression on the register values `V`. */
function registerRead(a: Address): string {
  const value = `V[${a.address}]`;
  if (a.mask === 0xffffffff && a.rshift === 0) return value;
  if (a.rshift === 0) return `(${value} & ${a.mask})`;
  return `((${value} & ${a.mask}) >>> ${a.rshift})`;
}
