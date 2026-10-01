import { describe, expect, it } from 'vitest';
import { Op, operandTypeErrorMessage } from './op';

describe('operandTypeErrorMessage', () => {
  it.each([
    [
      Op.REG | Op.M8 | Op.M16 | Op.M32,
      'Operand must be a register, or an 8bit, 16bit or 32bit memory location. ',
    ],
    [
      Op.R8 | Op.R16 | Op.M8 | Op.M16,
      'Operand must be an 8bit or 16bit register, or an 8bit or 16bit memory location. ',
    ],
    [
      Op.M32 | Op.M64 | Op.FPUREG,
      'Operand must be a 32bit or 64bit memory location, or an FPU register. ',
    ],
    [Op.MEM, 'Operand must be a memory location. '],
    [Op.NULL, 'Operand must be empty. '],
    [Op.R16 | Op.R32, 'Operand must be a 16bit or 32bit register. '],
    [Op.R8 | Op.M8, 'Operand must be an 8bit register, or an 8bit memory location. '],
    [
      Op.IMM | Op.CHARS | Op.STRING | Op.NULL | Op.LABEL | Op.CONST,
      'Operand must be an immediate, a label, a short string, or empty. ',
    ],
    [Op.I8 | Op.I16 | Op.I32 | Op.I64, 'Operand must be an immediate. '],
    // FPUST0 overlaps the FPUREG bits, so the original never prints "ST0".
    [Op.FPUST0, 'Operand must be an FPU register. '],
    [0, 'Invalid operand (no description available)'],
  ])('%i', (types, message) => {
    expect(operandTypeErrorMessage(types)).toBe(message);
  });
});
