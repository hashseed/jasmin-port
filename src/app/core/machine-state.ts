/** Register names in the order the UI and the headless runner list them (spec 02 §7.2). */
export const REGISTER_NAMES = [
  'EAX',
  'EBX',
  'ECX',
  'EDX',
  'ESI',
  'EDI',
  'ESP',
  'EBP',
  'EIP',
] as const;
export type RegisterName = (typeof REGISTER_NAMES)[number];

/** Flags printed by the headless runner, in its order (spec 08 §2). */
export const DUMP_FLAG_NAMES = ['CF', 'OF', 'SF', 'ZF', 'PF', 'AF', 'DF'] as const;
export const FLAG_NAMES = [...DUMP_FLAG_NAMES, 'TF'] as const;
export type FlagName = (typeof FLAG_NAMES)[number];

/**
 * A plain snapshot of the machine, enough to print the final state. The real
 * DataSpace (spec 04) replaces the factory below in M1; this shape stays the
 * input of the state dump.
 */
export interface MachineState {
  readonly offset: number;
  readonly memory: Uint8Array;
  readonly registers: Readonly<Record<RegisterName, number>>;
  readonly flags: Readonly<Record<FlagName, boolean>>;
  readonly fpu: { readonly top: number; readonly registers: readonly number[] };
}

export interface MachineConfig {
  /** Simulated memory size in bytes (setting `memory`, default 4096). */
  readonly memorySize: number;
  /** Start address of usable memory (setting `offset`, default 0). */
  readonly offset: number;
}

export const DEFAULT_MACHINE_CONFIG: MachineConfig = { memorySize: 4096, offset: 0 };

/** State of a freshly created document (spec 04 §1): zeroes, ESP = EBP = end of memory. */
export function createInitialState(config: MachineConfig = DEFAULT_MACHINE_CONFIG): MachineState {
  const end = (config.offset + config.memorySize) >>> 0;
  const registers = Object.fromEntries(REGISTER_NAMES.map((r) => [r, 0])) as Record<
    RegisterName,
    number
  >;
  registers.ESP = end;
  registers.EBP = end;
  return {
    offset: config.offset,
    memory: new Uint8Array(config.memorySize),
    registers,
    flags: Object.fromEntries(FLAG_NAMES.map((f) => [f, false])) as Record<FlagName, boolean>,
    fpu: { top: 0, registers: new Array<number>(8).fill(0) },
  };
}
