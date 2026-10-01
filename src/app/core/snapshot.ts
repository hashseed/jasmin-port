import { MemCellInfo } from './address';
import { DataSpace, FlagState } from './data-space';
import { FpuStatus } from './fpu';
import { FLAG_NAMES, REGISTER_NAMES, RegisterName } from './machine-state';
import { Op } from './op';

const FPU_STATUS_NAMES = [
  'C0',
  'C1',
  'C2',
  'C3',
  'IE',
  'DE',
  'ZE',
  'OE',
  'UE',
  'PE',
  'SF',
] as const satisfies readonly (keyof FpuStatus)[];

export type LabelCell =
  | {
      readonly kind: 'memory';
      readonly address: number;
      readonly size: number;
      readonly label: string;
    }
  | { readonly kind: 'register'; readonly register: RegisterName; readonly label: string };

/**
 * The saved machine state: the JSON `.mem` file (spec 09 §4.3) and the in-document
 * snapshot (spec 04 §9.10). Change stamps are not part of it.
 */
export interface MachineSnapshot {
  readonly format: 'jasmin-mem';
  readonly version: 1;
  readonly memorySize: number;
  readonly offset: number;
  /** Base64 of `memorySize` bytes, address `offset` first. */
  readonly memory: string;
  readonly registers: Readonly<Record<RegisterName, number>>;
  readonly flags: Readonly<FlagState>;
  readonly variables: Readonly<Record<string, number>>;
  /** JSON numbers when safe integers, else decimal strings. */
  readonly constants: Readonly<Record<string, number | string>>;
  readonly nextFree: number;
  readonly labelCells: readonly LabelCell[];
  readonly fpu: {
    readonly top: number;
    /** `R0..R7` as 16-digit hex of their float64 bit patterns. */
    readonly registers: readonly string[];
    readonly tags: readonly number[];
    readonly status: Readonly<FpuStatus>;
  };
}

export const NOT_A_MEMORY_FILE = 'Not a Jasmin memory file.';

/** Captures the machine state of `dsp`. */
export function takeSnapshot(dsp: DataSpace): MachineSnapshot {
  const registers = Object.fromEntries(
    REGISTER_NAMES.map((name) => [name, dsp.registers.get(dsp.getRegisterArgument(name)!)]),
  ) as Record<RegisterName, number>;
  const constants: Record<string, number | string> = {};
  for (const name of dsp.getConstantList()) {
    const value = dsp.getConstant(name);
    constants[name] =
      value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(value)
        : value.toString();
  }
  const cells = dsp.getLabelCells();
  const labelCells: LabelCell[] = [
    ...[...cells.memory].map(([address, info]) => ({
      kind: 'memory' as const,
      address,
      size: info.size,
      label: info.value,
    })),
    ...[...cells.registers].map(([index, info]) => ({
      kind: 'register' as const,
      register: REGISTER_NAMES[index],
      label: info.value,
    })),
  ];
  const fpuBits = new BigUint64Array(dsp.fpu.registers.buffer.slice(0));
  return {
    format: 'jasmin-mem',
    version: 1,
    memorySize: dsp.memorySize,
    offset: dsp.offset,
    memory: bytesToBase64(dsp.memory.bytes),
    registers,
    flags: { ...dsp.flags },
    variables: Object.fromEntries(dsp.getVariableList().map((v) => [v, dsp.getVariable(v)])),
    constants,
    nextFree: dsp.nextFree,
    labelCells,
    fpu: {
      top: dsp.fpu.top,
      registers: [...fpuBits].map((bits) => bits.toString(16).toUpperCase().padStart(16, '0')),
      tags: [...dsp.fpu.tags],
      status: { ...dsp.fpu.status },
    },
  };
}

/**
 * Replaces the state of `dsp` with the snapshot and clears the change stamps.
 * The snapshot must have the same memory size and offset.
 */
export function restoreSnapshot(dsp: DataSpace, snapshot: MachineSnapshot): void {
  if (snapshot.memorySize !== dsp.memorySize || snapshot.offset !== dsp.offset) {
    throw new Error('Snapshot memory layout does not match');
  }
  dsp.clear();
  dsp.memory.bytes.set(base64ToBytes(snapshot.memory));
  for (const name of REGISTER_NAMES) {
    dsp.registers.set(dsp.getRegisterArgument(name)!, BigInt(snapshot.registers[name]));
  }
  dsp.setFlags(snapshot.flags);
  dsp.setSymbols(
    new Map(Object.entries(snapshot.variables)),
    new Map(Object.entries(snapshot.constants).map(([k, v]) => [k, BigInt(v)])),
  );
  dsp.nextFree = snapshot.nextFree;
  const memoryCells = new Map<number, MemCellInfo>();
  const registerCells = new Map<number, MemCellInfo>();
  for (const cell of snapshot.labelCells) {
    if (cell.kind === 'memory') {
      memoryCells.set(cell.address, { type: Op.LABEL, value: cell.label, size: cell.size });
    } else {
      const index = REGISTER_NAMES.indexOf(cell.register);
      registerCells.set(index, { type: Op.LABEL, value: cell.label, size: 4 });
    }
  }
  dsp.setLabelCells(memoryCells, registerCells);
  const fpu = dsp.fpu;
  const bits = new BigUint64Array(snapshot.fpu.registers.map((hex) => BigInt(`0x${hex}`)));
  fpu.registers = new Float64Array(bits.buffer);
  fpu.tags = Uint8Array.from(snapshot.fpu.tags);
  fpu.top = snapshot.fpu.top;
  fpu.status = { ...snapshot.fpu.status };
  dsp.registers.clearDirty();
  dsp.memory.clearDirty();
}

/** The `.mem` file text for a snapshot. */
export function serializeSnapshot(snapshot: MachineSnapshot): string {
  return JSON.stringify(snapshot, null, 2) + '\n';
}

/**
 * Parses and validates `.mem` file text (spec 09 §4.3). Returns null for anything
 * that is not a valid version 1 memory file.
 */
export function parseSnapshot(text: string): MachineSnapshot | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  return isSnapshot(data) ? data : null;
}

type Json = Record<string, unknown>;

const isObject = (v: unknown): v is Json =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min: number, max: number): v is number =>
  Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const UINT32_MAX = 0xffffffff;
const LABEL_NAME = /^[^ \t;:']+$/;

function isSnapshot(d: unknown): d is MachineSnapshot {
  if (!isObject(d) || d['format'] !== 'jasmin-mem' || d['version'] !== 1) return false;
  const size = d['memorySize'];
  const offset = d['offset'];
  if (!isInt(size, 4, 0x7fffffff) || size % 4 !== 0) return false;
  if (!isInt(offset, 0, 0x7fffffff - size)) return false;
  if (typeof d['memory'] !== 'string') return false;
  const bytes = tryBase64ToBytes(d['memory']);
  if (!bytes || bytes.length !== size) return false;

  const registers = d['registers'];
  if (!isObject(registers) || !REGISTER_NAMES.every((r) => isInt(registers[r], 0, UINT32_MAX))) {
    return false;
  }
  const flags = d['flags'];
  if (!isObject(flags) || !FLAG_NAMES.every((f) => typeof flags[f] === 'boolean')) return false;

  const variables = d['variables'];
  if (!isObject(variables)) return false;
  for (const [name, address] of Object.entries(variables)) {
    if (!LABEL_NAME.test(name) || !isInt(address, 0, 0x7fffffff)) return false;
  }
  const constants = d['constants'];
  if (!isObject(constants)) return false;
  for (const [name, value] of Object.entries(constants)) {
    if (!LABEL_NAME.test(name) || !isConstantValue(value)) return false;
  }
  if (!isInt(d['nextFree'], 0, 0x7fffffff)) return false;

  const cells = d['labelCells'];
  if (!Array.isArray(cells) || !cells.every((c) => isLabelCell(c, offset, size))) return false;

  const fpu = d['fpu'];
  if (!isObject(fpu) || !isInt(fpu['top'], 0, 7)) return false;
  const fpuRegisters = fpu['registers'];
  const tags = fpu['tags'];
  const status = fpu['status'];
  if (!Array.isArray(fpuRegisters) || fpuRegisters.length !== 8) return false;
  if (!fpuRegisters.every((r) => typeof r === 'string' && /^[0-9A-Fa-f]{16}$/.test(r))) {
    return false;
  }
  if (!Array.isArray(tags) || tags.length !== 8 || !tags.every((t) => isInt(t, 0, 3))) return false;
  if (!isObject(status) || !FPU_STATUS_NAMES.every((s) => typeof status[s] === 'boolean')) {
    return false;
  }
  return true;
}

function isConstantValue(value: unknown): boolean {
  if (typeof value === 'number') return Number.isSafeInteger(value);
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return false;
  const n = BigInt(value);
  return n >= -(2n ** 63n) && n < 2n ** 63n;
}

function isLabelCell(c: unknown, offset: number, size: number): boolean {
  if (!isObject(c) || typeof c['label'] !== 'string') return false;
  if (c['kind'] === 'memory') {
    return isInt(c['address'], offset, offset + size - 1) && isInt(c['size'], 1, 8);
  }
  if (c['kind'] === 'register') {
    return (REGISTER_NAMES as readonly unknown[]).includes(c['register']);
  }
  return false;
}

// ---- base64 (atob/btoa exist in browsers and Node) ----

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function tryBase64ToBytes(text: string): Uint8Array | null {
  try {
    return base64ToBytes(text);
  } catch {
    return null;
  }
}
