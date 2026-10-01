import { CommandClass } from '../command';
import { Fabs } from './fabs';
import { Fadd } from './fadd';
import { Faddp } from './faddp';
import { Fiadd } from './fiadd';
import { Fild } from './fild';
import { Fld } from './fld';
import { Fldxx } from './fldxx';
import { Fsin } from './fsin';

/** Instruction classes of the fpu group (registered in ./index.ts). */
export const FPU_COMMANDS: CommandClass[] = [Fabs, Fadd, Faddp, Fiadd, Fild, Fld, Fldxx, Fsin];
