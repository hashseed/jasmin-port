import { CommandClass } from '../command';
import { DB } from './db';
import { Equ } from './equ';
import { ALU_COMMANDS } from './group-alu';
import { CONTROL_COMMANDS } from './group-control';
import { FPU_COMMANDS } from './group-fpu';
import { Inc } from './inc';
import { Lods } from './lods';
import { Mov } from './mov';
import { Nop } from './nop';
import { Pop } from './pop';
import { Push } from './push';
import { Resb } from './resb';

/** Every instruction class; each registers the mnemonics it implements. */
export const COMMAND_CLASSES: readonly CommandClass[] = [
  DB,
  Equ,
  Inc,
  Lods,
  Mov,
  Nop,
  Pop,
  Push,
  Resb,
  ...ALU_COMMANDS,
  ...CONTROL_COMMANDS,
  ...FPU_COMMANDS,
];
