import { CommandClass } from '../command';
import { DB } from './db';
import { Equ } from './equ';
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
];
