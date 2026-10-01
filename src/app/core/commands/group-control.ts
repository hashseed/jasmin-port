import { CommandClass } from '../command';
import { Call } from './call';
import { JasminSleep } from './jasmin-sleep';
import { Jmp } from './jmp';
import { Loop } from './loop';
import { PopA } from './popa';
import { PopAD } from './popad';
import { PopF } from './popf';
import { PushA } from './pusha';
import { PushAD } from './pushad';
import { PushF } from './pushf';
import { Ret } from './ret';
import { Setcc } from './setcc';
import { Std } from './std';

/** Instruction classes of the control group (registered in ./index.ts). */
export const CONTROL_COMMANDS: CommandClass[] = [
  Call,
  Jmp,
  Loop,
  Ret,
  PopA,
  PopAD,
  PopF,
  PushA,
  PushAD,
  PushF,
  Std,
  Setcc,
  JasminSleep,
];
