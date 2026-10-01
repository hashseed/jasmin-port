/**
 * Operand type bit flags and their human-readable names (port of `jasmin.core.Op`,
 * spec 03 §4 and §8).
 */
export const Op = {
  ERROR: 0b1,
  NULL: 0b10,

  R8: 0b100,
  R16: 0b1000,
  R32: 0b10000,
  R64: 0b100000,
  REG: 0b111100,

  M8: 0b1000000,
  M16: 0b10000000,
  M32: 0b100000000,
  M64: 0b1000000000,
  MU: 0b10000000000,
  MEM: 0b11111000000,

  I8: 0b100000000000,
  I16: 0b1000000000000,
  I32: 0b10000000000000,
  I64: 0b100000000000000,
  IMM: 0b111100000000000,

  CHARS: 0b1000000000000000,
  STRING: 0b10000000000000000,
  LABEL: 0b100000000000000000,
  VARIABLE: 0b1000000000000000000,
  SIZEQUALI: 0b10000000000000000000,
  COMMA: 0b100000000000000000000,
  PREFIX: 0b1000000000000000000000,
  FPUREG: 0b110000000000000000000000,
  FPUST0: 0b100000000000000000000000,
  FPUQUALI: 0b1000000000000000000000000,

  FLOAT: 0b10000000000000000000000000,
  CONST: 0b100000000000000000000000000,

  PARAM: 0b110110001111111111111111100,
} as const;

/** The sized variant of a MEM, REG or IMM type, e.g. (MEM, 4) -> M32; size -1 gives MU. */
export function getDefinition(type: number, size: number): number {
  const table: Record<number, readonly number[]> = {
    [Op.MEM]: [Op.M8, Op.M16, Op.M32, Op.M64],
    [Op.REG]: [Op.R8, Op.R16, Op.R32, Op.R64],
    [Op.IMM]: [Op.I8, Op.I16, Op.I32, Op.I64],
  };
  const variants = table[type];
  if (!variants) return Op.ERROR;
  if (type === Op.MEM && size === -1) return Op.MU;
  const index = [1, 2, 4, 8].indexOf(size);
  return index === -1 ? Op.ERROR : variants[index];
}

export function matches(opA: number, opB: number): boolean {
  return (opA & opB) !== 0;
}

const HUMAN_NAMES: Record<number, string> = {
  [Op.M8]: 'an 8-bit memory location',
  [Op.M16]: 'a 16-bit memory location',
  [Op.M32]: 'a 32-bit memory location',
  [Op.M64]: 'a 64-bit memory location',
  [Op.MU]: 'a memory location of undefined size',
  [Op.MEM]: 'a memory location',
  [Op.R8]: 'an 8-bit register',
  [Op.R16]: 'a 16-bit register',
  [Op.R32]: 'a 32-bit register',
  [Op.R64]: 'a 64-bit register',
  [Op.REG]: 'a register',
  [Op.I8]: 'an 8-bit immediate',
  [Op.I16]: 'a 16-bit immediate',
  [Op.I32]: 'a 32-bit immediate',
  [Op.I64]: 'a 64-bit immediate',
  [Op.IMM]: 'an immediate',
  [Op.LABEL]: 'a label',
  [Op.VARIABLE]: 'a variable',
  [Op.CONST]: 'a constant',
  [Op.SIZEQUALI]: 'a size qualifier',
  [Op.PREFIX]: 'a prefix',
  [Op.CHARS]: 'a short string',
  [Op.STRING]: 'a string',
  [Op.FPUREG]: 'an FPU register',
  [Op.FPUST0]: 'ST0',
  [Op.FPUQUALI]: 'an FPU qualifier',
  [Op.NULL]: 'empty',
  [Op.ERROR]: 'ERROR!',
  [Op.FLOAT]: 'a floating-point constant',
};

export function humanName(op: number): string {
  return HUMAN_NAMES[op] ?? `no human name defined for type ${op}`;
}

/**
 * Describes a subset of one size family, e.g. "a 16bit or 32bit register" or
 * "an 8bit, 16bit or 32bit memory location", exactly like the original.
 */
function sizedGroupName(
  ops: number,
  sized: readonly [number, number, number, number],
  noun: string,
) {
  const [s8, s16, s32, s64] = sized;
  let text = '';
  let or = ' or ';
  let done = false;
  const add = (bits: string) => {
    if (done) {
      text = bits + (or === '' ? ', ' : or) + text;
      or = '';
    } else {
      text = bits + ' ';
      done = true;
    }
  };
  if (matches(ops, s64)) add('64bit');
  if (matches(ops, s32)) add('32bit');
  if (matches(ops, s16)) add('16bit');
  if (matches(ops, s8)) add('an 8bit');
  else text = 'a ' + text;
  return text + noun;
}

export function humanNamesArray(ops: number): string[] {
  const list: string[] = [];
  const groups: [number, readonly [number, number, number, number], string][] = [
    [Op.REG, [Op.R8, Op.R16, Op.R32, Op.R64], 'register'],
    [Op.MEM, [Op.M8, Op.M16, Op.M32, Op.M64], 'memory location'],
    [Op.IMM, [Op.I8, Op.I16, Op.I32, Op.I64], 'immediate'],
  ];
  for (const [all, sized, noun] of groups) {
    if ((ops & all) === all) list.push(humanName(all));
    else if (matches(ops, all)) list.push(sizedGroupName(ops, sized, noun));
  }
  if (matches(ops, Op.LABEL)) list.push(humanName(Op.LABEL));
  if (matches(ops, Op.SIZEQUALI)) list.push(humanName(Op.SIZEQUALI));
  if (matches(ops, Op.PREFIX)) list.push(humanName(Op.PREFIX));
  if (matches(ops, Op.CHARS)) list.push(humanName(Op.CHARS));
  else if (matches(ops, Op.STRING)) list.push(humanName(Op.STRING));
  if (matches(ops, Op.FPUREG)) list.push(humanName(Op.FPUREG));
  else if (matches(ops, Op.FPUST0)) list.push(humanName(Op.FPUST0));
  if (matches(ops, Op.FPUQUALI)) list.push(humanName(Op.FPUQUALI));
  if (matches(ops, Op.FLOAT)) list.push(humanName(Op.FLOAT));
  if (matches(ops, Op.NULL)) list.push(humanName(Op.NULL));
  return list;
}

/** `Operand must be a, b, or c. ` (note the trailing space), as in `Parameters.errorMsg`. */
export function operandTypeErrorMessage(allowedTypes: number): string {
  const names = humanNamesArray(allowedTypes);
  if (names.length === 0) return 'Invalid operand (no description available)';
  let msg = 'Operand must be ';
  for (let i = 0; i < names.length - 1; i++) {
    msg += names[i] + ', ';
    if (i === names.length - 2) msg += 'or ';
  }
  return msg + names[names.length - 1] + '. ';
}

/** Splits `'long string'` into quoted chunks of `chunkSize` characters. */
export function splitLongString(quoted: string, chunkSize: number): string[] {
  let rest = quoted.substring(1, quoted.length - 1);
  const result: string[] = [];
  while (rest.length > chunkSize) {
    result.push(`'${rest.substring(0, chunkSize)}'`);
    rest = rest.substring(chunkSize);
  }
  result.push(`'${rest}'`);
  return result;
}
