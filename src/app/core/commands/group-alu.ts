import { CommandClass } from '../command';
import { Aaa } from './aaa';
import { Add } from './add';
import { And } from './and';
import { Bsf } from './bsf';
import { Bswap } from './bswap';
import { Bt } from './bt';
import { Cbw } from './cbw';
import { Cmpxchg } from './cmpxchg';
import { Cmpxchg8b } from './cmpxchg8b';
import { Div } from './div';
import { Imul } from './imul';
import { Lea } from './lea';
import { Movsx } from './movsx';
import { Movzx } from './movzx';
import { Mul } from './mul';
import { Rcl } from './rcl';
import { Shld } from './shld';
import { Shr } from './shr';
import { Xadd } from './xadd';
import { Xchg } from './xchg';

/** Instruction classes of the alu group (registered in ./index.ts). */
export const ALU_COMMANDS: CommandClass[] = [
  Aaa,
  Add,
  And,
  Bsf,
  Bswap,
  Bt,
  Cbw,
  Cmpxchg,
  Cmpxchg8b,
  Div,
  Imul,
  Lea,
  Movsx,
  Movzx,
  Mul,
  Rcl,
  Shld,
  Shr,
  Xadd,
  Xchg,
];
