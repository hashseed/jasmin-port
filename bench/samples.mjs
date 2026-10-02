#!/usr/bin/env node
/**
 * Sample benchmark: runs scaled-up versions of the samples in public/samples (and a
 * shift-heavy CRC-32, since no sample shifts) headlessly, checks every result and
 * prints the median run time of each.
 *
 *   node bench/samples.mjs [--runs R] [--runner bench.js ...] [--list] [--emit DIR] [case ...]
 *
 * Each case starts from the sample's own text and changes only its input (or, for
 * the device samples, replaces JASMINSLEEP by a counter so the run ends), so the
 * hot loops are the sample's. A run is one `node <runner> program.asm memory`
 * process (`src/headless/bench.ts`: Run's batches without step limit, parsing not
 * timed). The final registers and memory are checked against a JavaScript
 * computation of the same result.
 *
 * --emit writes the programs to DIR as <case>.asm (with the memory size in the first
 * line) instead of running them.
 *
 * Without --runner the script bundles src/headless/bench.ts to dist/headless/bench.js
 * first. With several --runner bundles (e.g. built from different commits) the runs
 * alternate between them, case by case, and each gets its own median column.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sample = (name) => readFileSync(join(ROOT, 'public/samples', `${name}.asm`), 'utf8');

/** Replaces `from` (which must occur) in `text`. */
function edit(text, from, to) {
  if (!text.includes(from)) throw new Error(`sample changed: ${JSON.stringify(from)} not found`);
  return text.replace(from, to);
}

const dword = (state, address) =>
  (state.memory[address] |
    (state.memory[address + 1] << 8) |
    (state.memory[address + 2] << 16) |
    (state.memory[address + 3] << 24)) >>>
  0;
const dwords = (state, address, count) =>
  Array.from({ length: count }, (_, i) => dword(state, address + 4 * i));

function expectEqual(what, got, expected) {
  const a = JSON.stringify(got);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: got ${a.slice(0, 200)}, expected ${b.slice(0, 200)}`);
}

function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
}

/**
 * A sorting sample on `count` dwords. Its `dd` data becomes `resd count`, filled at
 * the start of the run by a linear congruential generator (Run parses each line when
 * it first executes it, so thousands of `dd` lines would time the parser).
 */
function sortCase(name, count, seed) {
  const values = [];
  let x = seed;
  for (let i = 0; i < count; i++) {
    x = (Math.imul(x, 1103515245) + 12345) | 0;
    values.push(x >>> 2);
  }
  const fill = `mov eax, ${seed}
mov ecx, 0
fill:
imul eax, eax, 1103515245
add eax, 12345
mov edx, eax
shr edx, 2
mov [ecx*4+data], edx
inc ecx
cmp ecx, ${count}
jl fill
mov esi, data`;
  const source = edit(
    sample(name).replace(/^data:\n(dd .*\n|\n)+data_end:/m, `data: resd ${count}\ndata_end:`),
    'mov esi, data',
    fill,
  );
  return {
    memory: count * 4 * 6 + 65536,
    source,
    check: (state) =>
      expectEqual(
        'sorted data',
        dwords(state, 0, count),
        [...values].sort((a, b) => a - b),
      ),
  };
}

/** The cases: name, what they exercise, program, memory size and result check. */
const CASES = {
  primes: {
    about: 'DIV, PUSH/POP, CMP/Jcc: trial division of 90 * 3999971',
    build() {
      const prime = 3999971;
      if (!isPrime(prime)) throw new Error('not prime');
      return {
        memory: 4096,
        source: edit(sample('primes'), 'mov eax, 1234567890', `mov eax, ${90 * prime}`),
        check: (state) => expectEqual('factors', dwords(state, 0, 6), [2, 3, 3, 5, prime, 0]),
      };
    },
  },
  sqrt: {
    about: 'DIV, MUL, memory INC: square roots of 150,000 numbers',
    build() {
      const count = 150000;
      const factor = 28657;
      const source = edit(
        edit(sample('sqrt'), 'counter:\ndd 0', 'counter:\ndd 0\nsum:\ndd 0'),
        'mov eax, -1\ncall sqrt',
        `mov ebp, ${count}\nnext:\nimul eax, ebp, ${factor}\ncall sqrt\nadd [sum], eax\ndec ebp\njnz next`,
      );
      let sum = 0;
      let counter = 0;
      for (let i = count; i > 0; i--) {
        const n = Math.imul(i, factor) >>> 0;
        let low = 0;
        let high = 65536;
        for (;;) {
          counter++;
          if (high - low === 1) break;
          const middle = (low + high) >>> 1;
          if (middle * middle > n) high = middle;
          else low = middle;
        }
        sum = (sum + low) >>> 0;
      }
      // two, counter and sum are the program's only dwords (at 0, 4 and 8).
      return {
        memory: 4096,
        source,
        check: (state) => expectEqual('counter, sum', dwords(state, 4, 2), [counter >>> 0, sum]),
      };
    },
  },
  mergesort: {
    about: 'memory MOV/CMP, PUSH/POP of memory, CALL/RET: 120,000 dwords',
    build: () => sortCase('mergesort', 120000, 7),
  },
  quicksort: {
    about: 'IDIV, IMUL, memory ADD/CMP, PUSH/POP of memory: 150,000 dwords',
    build: () => sortCase('quicksort', 150000, 11),
  },
  life: {
    about: 'ADC, CALL/RET, PUSH/POP, BT/BTS/BTR: 1,000 generations',
    build() {
      const generations = 1000;
      const source = edit(
        edit(
          sample('life'),
          'next: resw 16 ; the next generation',
          `next: resw 16\ngens: dd ${generations}`,
        ),
        'jasminsleep 200\n\tjmp generation',
        'dec dword [gens]\n\tjnz generation',
      );
      let rows = [0x2, 0x4, 0x7, ...Array(13).fill(0)];
      const cell = (x, y) => (rows[y & 15] >> (x & 15)) & 1;
      for (let g = 0; g < generations; g++) {
        const next = Array(16).fill(0);
        for (let y = 0; y < 16; y++) {
          for (let x = 0; x < 16; x++) {
            let n = 0;
            for (const [dx, dy] of [
              [-1, -1],
              [0, -1],
              [1, -1],
              [-1, 0],
              [1, 0],
              [-1, 1],
              [0, 1],
              [1, 1],
            ]) {
              n += cell(x + dx, y + dy);
            }
            if (n === 3 || (n === 2 && cell(x, y))) next[y] |= 1 << x;
          }
        }
        rows = next;
      }
      return {
        memory: 4096,
        source,
        check: (state) =>
          expectEqual(
            'cells',
            Array.from(
              { length: 16 },
              (_, y) => state.memory[2 * y] | (state.memory[2 * y + 1] << 8),
            ),
            rows,
          ),
      };
    },
  },
  fizzbuzz: {
    about: 'DIV, byte MOV, CALL/RET: FizzBuzz up to 600,000 (each line overwrites the last)',
    build() {
      const count = 600000;
      const source = edit(
        edit(sample('fizzbuzz'), 'jasminsleep 100', 'mov edi, screen'),
        'cmp ecx, 101',
        `cmp ecx, ${count + 1}`,
      );
      const screen = [];
      for (let n = 1; n <= count; n++) {
        const line = ((n % 3 ? '' : 'Fizz') + (n % 5 ? '' : 'Buzz') || String(n)) + '\n';
        for (let i = 0; i < line.length; i++) screen[i] = line.charCodeAt(i);
      }
      return {
        memory: 4096,
        source,
        check: (state) => expectEqual('screen', [...state.memory.slice(0, screen.length)], screen),
      };
    },
  },
  fibonacci: {
    about: 'CALL/RET, PUSH/POP, Jcc: recursive fib(31)',
    build() {
      const n = 31;
      const fib = [0, 1];
      for (let i = 2; i <= n; i++) fib.push(fib[i - 1] + fib[i - 2]);
      return {
        memory: 4096,
        source: edit(sample('fibonacci'), 'mov ecx, 15', `mov ecx, ${n}`),
        check: (state) => expectEqual('EDX', state.registers.EDX, fib[n]),
      };
    },
  },
  ackermann: {
    about: 'CALL/RET, PUSH/POP, INC/DEC: A(3, 9)',
    build() {
      const n = 9;
      return {
        memory: 1 << 20,
        source: edit(sample('ackermann'), 'mov ebx, 3', `mov ebx, ${n}`),
        check: (state) => expectEqual('EBX', state.registers.EBX, 2 ** (n + 3) - 3),
      };
    },
  },
  crc32: {
    about: 'SHL/SHR/ROL, MOVZX, NEG, AND/XOR, LOOP (no sample shifts): CRC-32 of 300,000 bytes',
    build() {
      const count = 300000;
      const source = `; CRC-32 (bitwise) of ${count} xorshift32 bytes (bench/samples.mjs)
mov eax, 2463534242
mov ecx, 0
fill:
  mov edx, eax
  shl edx, 13
  xor eax, edx
  mov edx, eax
  shr edx, 17
  xor eax, edx
  mov edx, eax
  shl edx, 5
  xor eax, edx
  mov ebx, eax
  rol ebx, 11
  mov [ecx], bl
  inc ecx
  cmp ecx, ${count}
  jb fill
mov eax, -1
mov esi, 0
next_byte:
  movzx edx, byte [esi]
  xor eax, edx
  mov ecx, 8
next_bit:
  mov edx, eax
  shr eax, 1
  and edx, 1
  neg edx
  and edx, 0xEDB88320
  xor eax, edx
  loop next_bit
  inc esi
  cmp esi, ${count}
  jb next_byte
not eax
`;
      const bytes = [];
      let x = 2463534242;
      for (let i = 0; i < count; i++) {
        x ^= x << 13;
        x ^= x >>> 17;
        x ^= x << 5;
        bytes.push(((x << 11) | (x >>> 21)) & 0xff);
      }
      let crc = -1;
      for (const b of bytes) {
        crc ^= b;
        for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (-(crc & 1) & 0xedb88320);
      }
      return {
        memory: count + 4096,
        source,
        check: (state) => expectEqual('EAX', state.registers.EAX, ~crc >>> 0),
      };
    },
  },
};

/** The registers and memory of a `formatStateDump` (non-zero bytes only). */
function parseDump(text, memorySize) {
  const registers = {};
  for (const m of text.matchAll(/\b(E[A-Z]{2})=0x([0-9A-F]{8})/g))
    registers[m[1]] = parseInt(m[2], 16);
  const memory = new Uint8Array(memorySize);
  const line = text.split('\n').find((l) => l.startsWith('MEM'));
  for (const m of line.matchAll(/ ([0-9A-F]+):([0-9A-F]{2})/g))
    memory[parseInt(m[1], 16)] = parseInt(m[2], 16);
  const error = /^ERROR .*$/m.exec(text);
  return { registers, memory, error: error?.[0] };
}

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
};

function main(args) {
  let runs = 5;
  const runners = [];
  const names = [];
  let emit = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs') runs = Number(args[++i]);
    else if (args[i] === '--emit') emit = resolve(args[++i]);
    else if (args[i] === '--runner') runners.push(resolve(args[++i]));
    else if (args[i] === '--list') {
      for (const [name, c] of Object.entries(CASES)) console.log(`${name.padEnd(10)} ${c.about}`);
      return 0;
    } else names.push(args[i]);
  }
  const unknown = names.filter((n) => !(n in CASES));
  if (unknown.length || !(runs >= 1)) {
    process.stderr.write(
      `usage: node bench/samples.mjs [--runs R] [--runner bench.js ...] [--list] [--emit DIR] [${Object.keys(CASES).join('|')} ...]\n`,
    );
    return 2;
  }
  if (emit) {
    mkdirSync(emit, { recursive: true });
    for (const name of names.length ? names : Object.keys(CASES)) {
      const { source, memory } = CASES[name].build();
      writeFileSync(join(emit, `${name}.asm`), `; memory ${memory}\n${source}`);
    }
    return 0;
  }
  if (runners.length === 0) {
    execFileSync(
      'npx',
      [
        'esbuild',
        'src/headless/bench.ts',
        '--bundle',
        '--platform=node',
        '--target=node22',
        '--log-level=warning',
        '--outfile=dist/headless/bench.js',
      ],
      { cwd: ROOT, stdio: 'inherit' },
    );
    runners.push(join(ROOT, 'dist/headless/bench.js'));
  }
  const work = mkdtempSync(join(tmpdir(), 'jasmin-bench-'));
  let status = 0;
  const header = runners.length === 1 ? ['ms'] : runners.map((_, k) => `ms#${k + 1}`);
  console.log(`${'case'.padEnd(10)} ${header.map((h) => h.padStart(8)).join(' ')}  result`);
  try {
    for (const name of names.length ? names : Object.keys(CASES)) {
      const { source, memory, check } = CASES[name].build();
      const file = join(work, `${name}.asm`);
      writeFileSync(file, source);
      const times = runners.map(() => []);
      let result = 'ok';
      for (let r = 0; r < runs; r++) {
        runners.forEach((runner, k) => {
          const run = spawnSync(process.execPath, [runner, file, String(memory)], {
            encoding: 'utf8',
            maxBuffer: 1 << 28,
          });
          const ms = /ms=(\d+)/.exec(run.stderr);
          if (run.status !== 0 || !ms) throw new Error(`${runner} failed: ${run.stderr}`);
          const state = parseDump(run.stdout, memory);
          try {
            if (state.error) throw new Error(state.error);
            check(state);
          } catch (error) {
            result = `WRONG (runner ${k + 1}): ${error.message}`;
            status = 1;
          }
          times[k].push(Number(ms[1]));
        });
      }
      console.log(
        `${name.padEnd(10)} ${times.map((t) => String(median(t)).padStart(8)).join(' ')}  ${result}`,
      );
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return status;
}

process.exitCode = main(process.argv.slice(2));
