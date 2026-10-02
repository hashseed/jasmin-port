import { Address } from './address';
import { CalculatedAddress } from './calculated-address';
import { Command, Condition, conditionCode } from './command';
import { Add } from './commands/add';
import { And } from './commands/and';
import { Call } from './commands/call';
import { Cbw } from './commands/cbw';
import { Div } from './commands/div';
import { Imul } from './commands/imul';
import { Inc } from './commands/inc';
import { JasminSleep } from './commands/jasmin-sleep';
import { Jmp } from './commands/jmp';
import { Lea } from './commands/lea';
import { Loop } from './commands/loop';
import { Mov } from './commands/mov';
import { Movsx } from './commands/movsx';
import { Movzx } from './commands/movzx';
import { Mul } from './commands/mul';
import { Nop } from './commands/nop';
import { Pop } from './commands/pop';
import { Push } from './commands/push';
import { Rcl } from './commands/rcl';
import { Ret } from './commands/ret';
import { Setcc } from './commands/setcc';
import { Shr } from './commands/shr';
import { Xchg } from './commands/xchg';
import { DataSpace } from './data-space';
import { EVEN_PARITY, Flag } from './flags';
import { mulHighS32, mulHighU32 } from './java';
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
 *   AND/OR/XOR/TEST, LEA, Jcc/JMP, LOOPcc, PUSH, POP, CALL, RET, SHL/SAL/SHR/SAR,
 *   ROL/ROR/RCL/RCR, MUL, IMUL, DIV/IDIV, MOVZX/MOVSX, XCHG, SETcc, CMOVcc,
 *   CBW/CWDE/CWD/CDQ, NOP) run as specialized code that does what their `execute`
 *   does on numbers, with the operands resolved when compiling; the rare cases that
 *   `execute` computes with bigints (a rotate by a multiple of the operand size, a
 *   DIV/IDIV dividend from 2^53 on) call `execute` from the specialized code;
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
 *   (bytes a memory listener watches, label markers, addresses out of range);
 * - the general registers EAX..EBP that the specialized code uses live in locals
 *   (`r0`..`r7`, int32) while the function runs, and the part each wrote last in
 *   `m0`..`m7` (0: not written since the last write-back). They are loaded on
 *   entry and written back with their change stamps (`RegisterFile.setNum` deferred:
 *   the stamp does not move during a run) at every `return`, before every call of
 *   `execute` (then loaded again: it may write any register) and before the memory
 *   fallbacks (`getUpdateNum`, `putNum`), whose memory listeners may throw or look
 *   at the registers. Nothing else the code calls can throw. A line writes back only
 *   the locals that may be pending there (`dirtyLocals`), which keeps the code short;
 *   a region whose code would still be too long for V8 to optimize keeps the
 *   registers in `V` (`MAX_LOCALS_SOURCE`). (A `try`/`finally` around the loop would
 *   be simpler but makes every `execute` call slower.)
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
 * Largest source of a region that keeps registers in locals. The write-back and
 * reload around every line that calls `execute` make the code longer; past about
 * 60 KB of bytecode (about as many characters of source) V8 no longer optimizes the
 * function, so a region with many such lines keeps its registers in `V` instead.
 */
const MAX_LOCALS_SOURCE = 50_000;

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
  const region = new RegionCompiler(dsp, lines, start, end, isBreakpoint, true).compile();
  if (region.source.length <= MAX_LOCALS_SOURCE) return region;
  const plain = new RegionCompiler(dsp, lines, start, end, isBreakpoint, false).compile();
  return plain.source.length < region.source.length ? plain : region;
}

/** Whether Run runs `line` as specialized code (for statistics and tests). */
export function isSpecialized(dsp: DataSpace, line: RunLine): boolean {
  return new RegionCompiler(dsp, [line], 0, 0, () => false, true).specialize(0, line) !== null;
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
const SHIFT_FLAGS = LOGIC_FLAGS;
const ALL_FLAGS = ADD_FLAGS;

class RegionCompiler {
  private readonly constants: unknown[] = [];
  private readonly constantNames = new Map<unknown, string>();
  /** Per line: the lines up to the next exit (see `CompiledRegion.cost`). */
  private readonly cost: Int32Array;
  private readonly breakpoint: boolean[] = [];
  private enterableCache: Uint8Array | null = null;
  /** General registers (0..7) the code keeps in locals, and those it writes. */
  private readonly used = new Set<number>();
  private readonly written = new Set<number>();
  /** The line being compiled. */
  private line = 0;
  /** Per line: bit k if its code writes the local of register k. */
  private readonly writes: Int32Array;
  /** Per line: whether every local is written back after it (it calls `execute`). */
  private readonly clean: Uint8Array;
  /** Jumps that stay in the function (`continue`): [from, to] lines. */
  private readonly edges: [number, number][] = [];

  constructor(
    private readonly dsp: DataSpace,
    private readonly lines: readonly (RunLine | undefined)[],
    private readonly start: number,
    private readonly end: number,
    isBreakpoint: (line: number) => boolean,
    /** Whether EAX..EBP live in locals (see `CompiledRegion`), else in `V`. */
    private readonly locals: boolean,
  ) {
    this.cost = new Int32Array(end - start + 1);
    this.writes = new Int32Array(end - start + 1);
    this.clean = new Uint8Array(end - start + 1);
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
      this.line = line;
      if (entry.command && entry.param) {
        const special = this.specialize(line, entry, previous);
        if (special) specialized++;
        else {
          this.writes[line - this.start] = 0;
          this.clean[line - this.start] = 1;
        }
        result = special ?? this.generic(line, entry.command, entry.param);
      }
      let body = result.code;
      // A flag-setting line tells a following conditional jump that it ran just before.
      if (result.flags) body += `f = ${line};\n`;
      // Falling into a breakpoint line, or off the region, returns to the run loop.
      if (!result.jumps && (line === this.end || this.isStop(line + 1))) {
        body += `n += ${line} - s + 1; V[8] = ${line + 1}; return n;\n`;
      }
      // Every exit writes back the locals the line may have left pending.
      cases.push(`case ${line}:\n${body.replaceAll('return ', `${this.writeBack('>')}return `)}`);
      previous = result.flags;
    }
    const region = new CompiledRegion(this.start, this.end, this.cost, specialized);
    const names = this.constants.map((_, i) => `k${i}`);
    const used = [...this.used].sort((p, q) => p - q);
    const written = [...this.written].sort((p, q) => p - q);
    const load = used.map((k) => `r${k} = V[${k}] | 0;`).join(' ');
    const writeBackOf = (registers: readonly number[]) =>
      registers
        .map(
          (k) =>
            `if (m${k} !== 0) { V[${k}] = r${k}; RD[${k}] = R.stamp; RM[${k}] = m${k}; m${k} = 0; }\n`,
        )
        .join('');
    const writeBack = writeBackOf(written);
    const dirty = this.dirtyLocals();
    const locals = [...used.map((k) => `r${k} = 0`), ...written.map((k) => `m${k} = 0`)];
    const body = cases
      .join('')
      .replace(WRITE_BACK, (_, where: string, line: string) => {
        const i = Number(line) - this.start;
        const mask = where === '<' ? dirty.in[i] : dirty.out[i];
        return writeBackOf(written.filter((k) => mask & (1 << k)));
      })
      .replaceAll(LOAD, load ? `${load}\n` : '');
    const source =
      `"use strict";\n` +
      (names.length ? `const ${names.map((n, i) => `${n} = K[${i}]`).join(', ')};\n` : '') +
      `return function run(pc, budget) {\n` +
      `let n = 0, s = pc, f = -1, t = 0, a = 0, b = 0, r = 0, c = 0, x = 0, i = 0, w = 0, q = false, e = null;\n` +
      (locals.length ? `let ${locals.join(', ')};\n${load}\n` : '') +
      `for (;;) {\nswitch (pc) {\n${body}default:\n${writeBack}return n;\n}\n}\n};`;
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

  /**
   * The locals that may hold values not yet written back (bit k for register k)
   * when each line starts (`in`) and ends (`out`). A line is entered by falling
   * through from the line before, by a static jump, or with nothing pending: on
   * entry to the function and after a jump to EIP (which writes back first).
   */
  private dirtyLocals(): { in: Int32Array; out: Int32Array } {
    const count = this.end - this.start + 1;
    const into = new Int32Array(count);
    const out = new Int32Array(count);
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < count; i++) {
        let mask = i > 0 ? out[i - 1] : 0;
        for (const [from, to] of this.edges)
          if (to - this.start === i) mask |= out[from - this.start];
        const after = this.clean[i] ? 0 : mask | this.writes[i];
        if (mask !== into[i] || after !== out[i]) {
          into[i] = mask;
          out[i] = after;
          changed = true;
        }
      }
    }
    return { in: into, out };
  }

  /** Write-back of the locals pending at the start (`<`) or end (`>`) of the line. */
  private writeBack(where: '<' | '>'): string {
    return `/*write-back${where}${this.line}*/`;
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
    this.edges.push([this.line, target]);
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
      this.writeBack('>') +
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
      `${this.writeBack('<')}e = ${c}.execute(${p});\n${LOAD}` +
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
    if (!command || !p || !p.numeric) return null;
    // Operands read sign-extended only where the code below reads them so. (SAR and
    // IDIV set `p.signed` when they first run: their code does not depend on it.)
    if (p.signed && !SIGNED_COMMANDS.some((c) => command instanceof c)) return null;
    if (command instanceof Nop) return { code: '', jumps: false };
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
    if (command instanceof Mov) result = this.mov(line, p, ops, previous);
    else if (command instanceof Add) result = this.add(p, ops);
    else if (command instanceof Inc) result = this.inc(p, ops);
    else if (command instanceof And) result = this.and(p, ops);
    else if (command instanceof Lea) result = this.lea(p, ops);
    else if (command instanceof Shr) result = this.shift(p, ops);
    else if (command instanceof Rcl) result = this.rotate(line, command, p, ops);
    else if (command instanceof Mul) result = this.mul(p, ops);
    else if (command instanceof Imul) result = this.imul(p, ops);
    else if (command instanceof Div) result = this.div(line, command, p, ops);
    else if (command instanceof Movzx) result = this.extend(ops, false);
    else if (command instanceof Movsx) result = this.extend(ops, true);
    else if (command instanceof Xchg) result = this.xchg(ops);
    else if (command instanceof Setcc) result = this.setcc(line, p, ops, previous);
    else if (command instanceof Cbw) result = this.cbw(p);
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
      if (ea === null) return null;
      return { kind: 'mem', arg: a, value: 0, address: this.constant(a), ea };
    }
    return null;
  }

  /**
   * `calculateEffectiveAddress(true)` of `c` inline, or null if it uses a register
   * other than EAX..EBP (then the line calls `execute`).
   */
  private effectiveAddress(c: CalculatedAddress): string | null {
    const { base, index, scale, displacement } = c.parts;
    if ((base && !isGeneral(base)) || (index && !isGeneral(index))) return null;
    const terms: string[] = [];
    if (base) terms.push(this.registerInt(base));
    if (index) terms.push(`Math.imul(${this.registerInt(index)}, ${scale})`);
    terms.push(`(${displacement})`);
    return `((${terms.join(' + ')}) | 0)`;
  }

  /** Reads `op` into the local `name` as `Parameters.getNum` (unsigned). */
  private load(name: string, op: Operand): string {
    if (op.kind === 'imm') return `${name} = ${op.value};\n`;
    if (op.kind === 'reg') return `${name} = ${this.registerRead(op.arg)};\n`;
    // `DataSpace.getUpdateNum(a, false)`: inline unless out of range or label markers exist.
    const size = op.arg.size;
    const offset = this.dsp.offset;
    const limit = this.dsp.memoryEnd - size;
    const read = readBytes(size);
    return (
      `if (x >= ${offset} && x <= ${limit} && d.memInfo.size === 0) { i = x - ${offset}; ${name} = ${read}; }\n` +
      `else { ${this.writeBack('>')}${name} = d.getUpdateNum(${op.address}, false); }\n`
    );
  }

  /** Reads `op` into the local `name` as `Parameters.getNum` with `p.signed`. */
  private loadSigned(name: string, op: Operand): string {
    if (op.kind === 'imm') return `${name} = ${op.value};\n`;
    if (op.kind === 'reg') return `${name} = ${this.registerSigned(op.arg)};\n`;
    // `DataSpace.getUpdateNum(a, true)`, as `load`.
    const size = op.arg.size;
    const offset = this.dsp.offset;
    const limit = this.dsp.memoryEnd - size;
    const read = signExtend(readBytes(size), size);
    return (
      `if (x >= ${offset} && x <= ${limit} && d.memInfo.size === 0) { i = x - ${offset}; ${name} = ${read}; }\n` +
      `else { ${this.writeBack('>')}${name} = d.getUpdateNum(${op.address}, true); }\n`
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
      `}\nelse { ${this.writeBack('>')}d.putNum(${value}, ${op.address}, null); }\n`
    );
  }

  /**
   * `putNum(value, a, null)` for a register: `RegisterFile.setNum`, dropping a label
   * marker. A general register is written to its local; its stamp on write-back.
   */
  private storeRegister(a: Address, value: string): string {
    const k = a.address;
    const full = a.mask === 0xffffffff && a.rshift === 0;
    const labels = `if (d.regInfo.size !== 0) d.regInfo.delete(${k});\n`;
    if (this.inLocal(a)) {
      this.used.add(k);
      this.written.add(k);
      if (this.line >= this.start && this.line <= this.end) {
        this.writes[this.line - this.start] |= 1 << k;
      }
      const write = full
        ? `r${k} = ${value} | 0;\n`
        : `r${k} = (r${k} & ${~a.mask}) | ((${value} << ${a.rshift}) & ${a.mask});\n`;
      return write + `m${k} = ${a.mask | 0};\n` + labels;
    }
    const write = full
      ? `V[${k}] = ${value};\n`
      : `V[${k}] = (V[${k}] & ${~a.mask}) | ((${value} << ${a.rshift}) & ${a.mask});\n`;
    return write + `RD[${k}] = R.stamp; RM[${k}] = ${a.mask | 0};\n` + labels;
  }

  /** `RegisterFile.get(a)` as an expression (unsigned), from the local of a general register. */
  private registerRead(a: Address): string {
    if (!this.inLocal(a)) return registerRead(a);
    const k = a.address;
    this.used.add(k);
    if (a.mask === 0xffffffff && a.rshift === 0) return `(r${k} >>> 0)`;
    if (a.rshift === 0) return `(r${k} & ${a.mask})`;
    return `((r${k} & ${a.mask}) >>> ${a.rshift})`;
  }

  /** `DataSpace.getSignedRegisterNum(a)` as an expression. */
  private registerSigned(a: Address): string {
    if (a.size === 4) return this.registerInt(a);
    return signExtend(this.registerRead(a), a.size);
  }

  /** Whether the code keeps register `a` in a local. */
  private inLocal(a: Address): boolean {
    return this.locals && isGeneral(a);
  }

  /** `RegisterFile.get(a) | 0` as an expression. */
  private registerInt(a: Address): string {
    if (this.inLocal(a) && a.mask === 0xffffffff && a.rshift === 0) {
      this.used.add(a.address);
      return `r${a.address}`;
    }
    return `(${this.registerRead(a)} | 0)`;
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
      `c = ${this.registerInt(this.dsp.ESP)} - ${size};\n` +
      this.storeRegister(this.dsp.ESP, 'c') +
      `x = ${this.registerInt(this.dsp.ESP)};\n` +
      `if (x >= ${offset} && x <= ${this.dsp.memoryEnd - size}) {\n${this.writeBytes(size, 'a')}}\n` +
      `else d.setAddressOutOfRange();\n`
    );
  }

  /** `Parameters.pop` into the register `dest` (`size` bytes). */
  private popInto(dest: Address, size: number): string {
    const offset = this.dsp.offset;
    const end = this.dsp.memoryEnd;
    return (
      `c = ${this.registerRead(this.dsp.ESP)} + ${size};\n` +
      `if (c > ${end}) d.setAddressOutOfRange();\n` +
      `else {\n` +
      `x = ${this.registerInt(this.dsp.ESP)};\n` +
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
        : `${STACK_FAST} && ${unwatched(`((${this.registerInt(this.dsp.ESP)} - ${pushed}) | 0)`, pushed)}`;
    return (
      `if (${condition}) {\n${fast}} else {\n` +
      `${this.writeBack('<')}${this.constant(command)}.execute(${this.constant(p)});\n${LOAD}}\n` +
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

  private mov(
    line: number,
    p: Parameters,
    ops: Operand[],
    previous?: FlagState,
  ): { code: string } | null {
    // Labels (which mark the destination) call `execute`.
    if (p.type(1) === Op.LABEL || ops.length !== 2 || ops[0].kind === 'imm') return null;
    const move = this.load('a', ops[1]) + this.store(ops[0], 'a');
    if (p.mnemo === 'MOV') return { code: move };
    // CMOVcc reads the source only if the condition holds.
    const test = this.conditionTest(line, conditionCode(p.mnemo.substring(4)), previous);
    return { code: `if (${test}) {\n${move}}\n` };
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
    const ea = this.effectiveAddress(source);
    if (ea === null) return null;
    // LEA does not access memory: no range check.
    return { code: `c = ${ea};\n` + this.store(ops[0], 'c') };
  }

  /** `fCarry = value` (a boolean expression). */
  private setCarry(value: string): string {
    return `d.cf = ${value}; d.lazyFlags &= ${~Flag.CF};\n`;
  }

  /** `fOverflow = value` (a boolean expression). */
  private setOverflow(value: string): string {
    return `d.of = ${value}; d.lazyFlags &= ${~Flag.OF};\n`;
  }

  /**
   * Calls the command's `execute` for the cases the specialized code leaves to it
   * (before the line writes any local), then checks its error.
   */
  private fallback(line: number, command: Command, p: Parameters): string {
    return (
      `V[8] = ${line + 1};\n` +
      `${this.writeBack('<')}e = ${this.constant(command)}.execute(${this.constant(p)});\n${LOAD}` +
      `if (e) { d.clearAddressOutOfRange(); return fail(n + ${line} - s + 1, ${line}, e); }\n`
    );
  }

  /** A runtime error of DIV and IDIV (`Div.execute`) on `line`. */
  private divisionError(line: number, error: () => ParseError): string {
    return `d.clearAddressOutOfRange(); return fail(n + ${line} - s + 1, ${line}, ${this.constant(error)}());\n`;
  }

  /** SHL, SAL, SHR, SAR (`Shr.executeNum`). */
  private shift(p: Parameters, ops: Operand[]): { code: string } | null {
    if (ops.length !== 2 || ops[0].kind === 'imm') return null;
    const size = p.size;
    const bits = p.sizeOf(0) * 8;
    const flags: FlagState = { lazy: SHIFT_FLAGS, size, a: 'a', b: 'c', r: 'r', known: {} };
    let code = this.load('a', ops[0]) + this.load('c', ops[1]) + `c &= 31;\nif (c !== 0) {\n`;
    if (p.mnemo.endsWith('L')) {
      const carry = size === 4 ? `((a >>> (32 - c)) & 1) === 1` : `((r >> ${size * 8}) & 1) === 1`;
      code +=
        `r = a << c;\n` +
        this.store(ops[0], 'r') +
        this.setFlags(flags, 'c') +
        `q = ${carry};\n` +
        this.setCarry('q') +
        `if (c === 1) { ${this.setOverflow(`q !== (((r >> ${bits - 1}) & 1) === 1)`)}}\n`;
    } else {
      if (p.mnemo === 'SHR') {
        code += `if (c === 1) { ${this.setOverflow(`((a >>> ${bits - 1}) & 1) === 1`)}}\n`;
        code += `r = a >>> c;\n`;
      } else {
        // SAR reads the operand again, sign-extended.
        code += this.loadSigned('a', ops[0]);
        code += `if (c === 1) { ${this.setOverflow('false')}}\n`;
        code += `r = a >> c;\n`;
      }
      code +=
        this.store(ops[0], 'r') +
        this.setFlags(flags, 'c') +
        this.setCarry('((a >> (c - 1)) & 1) === 1');
    }
    return { code: code + `}\n` };
  }

  /**
   * ROL, ROR, RCL, RCR (`Rcl.execute`): the operand (with CF above it for RCL and
   * RCR) rotated within its width. A count that is a nonzero multiple of the width
   * calls `execute` (its CF then comes from bits beyond the rotated value).
   */
  private rotate(
    line: number,
    command: Command,
    p: Parameters,
    ops: Operand[],
  ): { code: string } | null {
    if (ops.length !== 2 || ops[0].kind === 'imm') return null;
    const bits = p.sizeOf(0) * 8;
    if (bits !== 8 && bits !== 16 && bits !== 32) return null;
    const throughCarry = p.mnemo.startsWith('RC');
    const width = throughCarry ? bits + 1 : bits;
    const mask = bits === 32 ? 0xffffffff : (1 << bits) - 1;
    // The value `b` (below 2^33) rotated right by `c` (1 .. width - 1) within `width` bits.
    const rotated =
      width <= 31
        ? `((b >>> c) | (b << (${width} - c))) & ${2 ** width - 1}`
        : width === 32
          ? `((b >>> c) | (b << (32 - c))) >>> 0`
          : `Math.floor(b / 2 ** c) + (b % 2 ** c) * 2 ** (${width} - c)`;
    // Bit k of b: the quotient is below 2^33, so its low bit survives `& 1`.
    const bit = (k: string) => `((Math.floor(b / 2 ** (${k})) & 1) === 1)`;
    let code =
      this.load('c', ops[1]) +
      `if (c !== 0) {\nc = c % ${width};\n` +
      `if (c === 0) {\n${this.fallback(line, command, p)}} else {\n` +
      this.load('a', ops[0]) +
      (throughCarry
        ? `b = ((a & ${mask}) >>> 0) + (d.fCarry ? ${2 ** bits} : 0);\n`
        : `b = (a & ${mask}) >>> 0;\n`);
    if (p.mnemo.endsWith('R')) {
      code +=
        `r = (${rotated}) % ${2 ** bits};\n` +
        `if (c === 1) { ${this.setOverflow(`((r >>> ${bits - 2}) & 1) !== ((r >>> ${bits - 1}) & 1)`)}}\n` +
        this.setCarry(bit('c - 1'));
    } else {
      // Left by k is right by width - k; CF is then bit width - k of the value.
      code +=
        `c = ${width} - c;\n` +
        `r = (${rotated}) % ${2 ** bits};\n` +
        `q = ${bit('c')};\n` +
        this.setCarry('q') +
        `if (c === ${width - 1}) { ${this.setOverflow(`q !== (((r >>> ${bits - 1}) & 1) === 1)`)}}\n`;
    }
    return { code: code + this.store(ops[0], 'r') + `}\n}\n` };
  }

  /** MUL (`Mul.executeNum`). */
  private mul(p: Parameters, ops: Operand[]): { code: string } | null {
    if (ops.length !== 1 || ops[0].kind === 'imm') return null;
    const d = this.dsp;
    let code = this.load('a', ops[0]);
    if (p.size === 1) {
      code += `c = ${this.registerRead(d.AL)} * a;\n` + this.storeRegister(d.AX, 'c');
      code += `q = (c >>> 8) !== 0;\n`;
    } else if (p.size === 2) {
      code += `c = ${this.registerRead(d.AX)} * a;\n` + this.storeRegister(d.AX, 'c & 65535');
      code += `w = c >>> 16;\n` + this.storeRegister(d.DX, 'w') + `q = w !== 0;\n`;
    } else if (p.size === 4) {
      code +=
        `b = ${this.registerRead(d.EAX)};\n` +
        this.storeRegister(d.EAX, 'Math.imul(b, a) >>> 0') +
        `w = ${this.constant(mulHighU32)}(b, a);\n` +
        this.storeRegister(d.EDX, 'w') +
        `q = w !== 0;\n`;
    } else {
      return null;
    }
    return { code: code + this.setCarry('q') + this.setOverflow('q') };
  }

  /** IMUL with one, two or three operands (`Imul.executeNum`; operands read signed). */
  private imul(p: Parameters, ops: Operand[]): { code: string } | null {
    const d = this.dsp;
    // Products of 2^62 and more (only with large immediates) are bigints in `execute`.
    if (ops.some((op) => op.kind === 'imm' && Math.abs(op.value) > 2 ** 31)) return null;
    let code: string;
    if (ops.length === 1) {
      if (ops[0].kind === 'imm') return null;
      code = this.loadSigned('a', ops[0]);
      if (p.size === 1) {
        code += `c = ${this.registerSigned(d.AL)} * a;\n` + this.storeRegister(d.AX, 'c');
        code += `q = c < -128 || c >= 128;\n`;
      } else if (p.size === 2) {
        code +=
          `c = ${this.registerSigned(d.AX)} * a;\n` +
          this.storeRegister(d.AX, 'c & 65535') +
          this.storeRegister(d.DX, '(c >> 16) & 65535') +
          `q = c < -32768 || c >= 32768;\n`;
      } else if (p.size === 4) {
        code +=
          `b = ${this.registerSigned(d.EAX)};\n` +
          `c = Math.imul(b, a);\n` +
          `w = ${this.constant(mulHighS32)}(b, a);\n` +
          this.storeRegister(d.EAX, 'c >>> 0') +
          this.storeRegister(d.EDX, 'w >>> 0') +
          `q = w !== c >> 31;\n`;
      } else {
        return null;
      }
    } else {
      if (ops[0].kind !== 'reg' || (p.size !== 1 && p.size !== 2 && p.size !== 4)) return null;
      const [first, second] = ops.length === 2 ? [ops[0], ops[1]] : [ops[1], ops[2]];
      const limit = 2 ** (p.size * 8 - 1);
      code =
        this.loadSigned('a', first) +
        this.loadSigned('b', second) +
        `c = b * a;\n` +
        this.storeRegister(ops[0].arg, 'Math.imul(b, a)') +
        `q = c < -${limit} || c >= ${limit};\n`;
    }
    return { code: code + this.setCarry('q') + this.setOverflow('q') };
  }

  /**
   * DIV and IDIV (`Div.executeNum`). A 32-bit dividend of 2^53 or more in magnitude
   * (EDX beyond 20 bits) calls `execute`. Division by zero and a quotient that does
   * not fit are errors that change nothing (07 Q-I-3).
   */
  private div(
    line: number,
    command: Command,
    p: Parameters,
    ops: Operand[],
  ): { code: string } | null {
    if (ops.length !== 1 || ops[0].kind === 'imm') return null;
    const d = this.dsp;
    const signed = p.mnemo === 'IDIV';
    const size = p.size;
    const divisor = signed ? this.loadSigned('b', ops[0]) : this.load('b', ops[0]);
    let code: string;
    if (size === 1) {
      const ax = signed ? this.registerSigned(d.AX) : this.registerRead(d.AX);
      code = divisor + `a = ${ax};\n`;
    } else if (size === 2) {
      const dx = signed ? this.registerSigned(d.DX) : this.registerRead(d.DX);
      code = divisor + `a = ${dx} * 65536 + ${this.registerRead(d.AX)};\n`;
    } else if (size === 4) {
      const edx = signed ? this.registerInt(d.EDX) : this.registerRead(d.EDX);
      code =
        `w = ${edx};\n` +
        `if (w > 1048575 || w < -1048575) {\n${this.fallback(line, command, p)}} else {\n` +
        divisor +
        `a = w * 4294967296 + ${this.registerRead(d.EAX)};\n`;
    } else {
      return null;
    }
    const bits = size * 8;
    const fits = signed
      ? `c >= ${-(2 ** (bits - 1))} && c < ${2 ** (bits - 1)}`
      : `c >= 0 && c < ${2 ** bits}`;
    const [quotient, remainder] =
      size === 1 ? [d.AL, d.AH] : size === 2 ? [d.AX, d.DX] : [d.EAX, d.EDX];
    code +=
      `if (b === 0) { ${this.divisionError(line, divisionByZero)}}\n` +
      `r = a % b;\nc = (a - r) / b;\n` +
      `if (!(${fits})) { ${this.divisionError(line, divisionOverflow)}}\n` +
      this.storeRegister(quotient, 'c') +
      this.storeRegister(remainder, 'r');
    return { code: size === 4 ? code + `}\n` : code };
  }

  /** MOVZX and MOVSX. */
  private extend(ops: Operand[], signed: boolean): { code: string } | null {
    if (ops.length !== 2 || ops[0].kind !== 'reg') return null;
    const load = signed ? this.loadSigned('a', ops[1]) : this.load('a', ops[1]);
    return { code: load + this.store(ops[0], 'a') };
  }

  /** XCHG (`Xchg.execute`): reads both operands, then writes operand 1, then operand 0. */
  private xchg(ops: Operand[]): { code: string } | null {
    if (ops.length !== 2 || ops[0].kind === 'imm' || ops[1].kind === 'imm') return null;
    let code = this.load('b', ops[1]) + this.load('a', ops[0]) + this.store(ops[1], 'a');
    // Operand 0's address is computed again: the first write may change its registers.
    if (ops[0].kind === 'mem') code += `x = ${ops[0].ea};\n${ops[0].address}.address = x;\n`;
    return { code: code + this.store(ops[0], 'b') };
  }

  /** SETcc (`Setcc.execute`). */
  private setcc(
    line: number,
    p: Parameters,
    ops: Operand[],
    previous?: FlagState,
  ): { code: string } | null {
    if (ops.length !== 1 || ops[0].kind === 'imm') return null;
    const test = this.conditionTest(line, conditionCode(p.mnemo.substring(3)), previous);
    return { code: `a = ${test} ? 1 : 0;\n` + this.store(ops[0], 'a') };
  }

  /** CBW, CWDE, CWD, CDQ (`Cbw.execute`). */
  private cbw(p: Parameters): { code: string } | null {
    const d = this.dsp;
    switch (p.mnemo) {
      case 'CBW':
        return { code: this.storeRegister(d.AX, this.registerSigned(d.AL)) };
      case 'CWDE':
        return { code: this.storeRegister(d.EAX, this.registerSigned(d.AX)) };
      case 'CWD':
        return { code: this.storeRegister(d.DX, `(${this.registerSigned(d.AX)} >> 16) & 65535`) };
      case 'CDQ':
        return { code: this.storeRegister(d.EDX, `${this.registerSigned(d.EAX)} >> 31`) };
      default:
        return null;
    }
  }

  /** The jump target of operand 0: a static line or a register (`getNum(0) | 0`). */
  private target(p: Parameters): { line: number } | { read: string } | null {
    const fixed = this.staticTarget(p);
    if (fixed !== null) return { line: fixed };
    const op = this.operand(p, 0);
    if (op?.kind === 'reg') return { read: this.registerInt(op.arg) };
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
    code += `c = ${this.registerRead(ecx)} - 1;\n`;
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
    const ecx = this.registerInt(this.dsp.ECX);
    const getter = conditionExpression(condition, ecx, (flag) => `d.${FLAG_GETTERS[flag]}`);
    if (!previous || getter === 'true' || getter === 'false') return getter;
    const fused = conditionExpression(condition, ecx, (flag) => flagFromLocals(flag, previous));
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
function conditionExpression(
  condition: number,
  ecx: string,
  flag: (flag: number) => string,
): string {
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
      return `((${ecx} & 65535) === 0)`;
    case Condition.ECXZ:
      return `(${ecx} === 0)`;
    case Condition.ALWAYS:
      return 'true';
    default:
      return 'false';
  }
}

/** Commands whose operands the specialized code reads sign-extended as `execute` does. */
const SIGNED_COMMANDS = [Imul, Movsx, Cbw, Div, Shr];

/** Stack code is inline only without label markers (and, for a push, watched bytes). */
const STACK_FAST = 'd.memInfo.size === 0 && d.regInfo.size === 0';

/**
 * Whether no memory listener watches the `size` bytes at `address` (an int32
 * expression): outside the hull of the watched ranges inline, else `isWatched`.
 */
function unwatched(address: string, size: number): string {
  return `(${address} >= M.watchEnd || ${address} + ${size} <= M.watchStart || !M.isWatched(${address}, ${size}))`;
}

/** The signed value of the unsigned `size`-byte expression `value`. */
function signExtend(value: string, size: number): string {
  if (size === 4) return `((${value}) | 0)`;
  const shift = 32 - size * 8;
  return `(((${value}) << ${shift}) >> ${shift})`;
}

const divisionByZero = () => ParseError.runtime('Division by zero');
const divisionOverflow = () => ParseError.runtime('Division overflow');

/** Unsigned little-endian read of `size` (1, 2 or 4) bytes at `B[i]`. */
function readBytes(size: number): string {
  if (size === 4) return `(B[i] | (B[i + 1] << 8) | (B[i + 2] << 16) | (B[i + 3] << 24)) >>> 0`;
  if (size === 2) return `B[i] | (B[i + 1] << 8)`;
  return `B[i]`;
}

/**
 * Placeholders in the code of a line for the write-back of the register locals and
 * their reload, filled in when the registers the region uses are known.
 */
const WRITE_BACK = /\/\*write-back([<>])(\d+)\*\//g;
const LOAD = '/*load*/';

/** Whether `a` is a part of EAX..EBP (kept in a local by compiled code). */
function isGeneral(a: Address): boolean {
  return a.address >= 0 && a.address <= 7;
}

/** `RegisterFile.get(a)` as an expression on the register values `V`. */
function registerRead(a: Address): string {
  const value = `V[${a.address}]`;
  if (a.mask === 0xffffffff && a.rshift === 0) return value;
  if (a.rshift === 0) return `(${value} & ${a.mask})`;
  return `((${value} & ${a.mask}) >>> ${a.rshift})`;
}
