import { DataSpace } from './data-space';
import { formatJavaDouble } from './java-double';
import { DUMP_FLAG_NAMES, MachineState, REGISTER_NAMES } from './machine-state';

const hex = (value: number, digits: number) =>
  (value >>> 0).toString(16).toUpperCase().padStart(digits, '0');

/** A plain snapshot of a DataSpace for the dump. */
export function machineStateOf(dsp: DataSpace): MachineState {
  const registers = Object.fromEntries(
    REGISTER_NAMES.map((name) => [name, dsp.registers.get(dsp.getRegisterArgument(name)!)]),
  ) as MachineState['registers'];
  return {
    offset: dsp.offset,
    memory: dsp.memory.bytes,
    registers,
    flags: dsp.flags,
    fpu: { top: dsp.fpu.top, registers: [...dsp.fpu.registers] },
  };
}

/**
 * The final-state dump printed by the headless runner, in the format of the Java
 * reference harness (spec 08 §2): registers, flags, non-zero memory bytes, FPU.
 */
export function formatStateDump(state: MachineState): string[] {
  const registers = REGISTER_NAMES.map((r) => `${r}=0x${hex(state.registers[r], 8)} `).join('');
  const flags = DUMP_FLAG_NAMES.map((f) => `${f}=${state.flags[f] ? 1 : 0}`).join(' ');
  let memory = 'MEM (non-zero bytes):';
  state.memory.forEach((byte, index) => {
    if (byte !== 0) memory += ` ${hex(index, 4)}:${hex(byte, 2)}`;
  });
  let fpu = 'FPU:';
  for (let i = 0; i < 8; i++) {
    const k = (i - state.fpu.top + 8) % 8;
    fpu += ` ST${k}=${formatJavaDouble(state.fpu.registers[i])}`;
  }
  return [registers, flags, memory, fpu];
}
