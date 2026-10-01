import { Command } from '../command';
import { Parameters } from '../parameters';
import { validateExtension } from './movzx';

/** MOVSX: sign-extending move (signed read). */
export class Movsx extends Command {
  readonly mnemonics = ['MOVSX'];

  override signed(): boolean {
    return true;
  }

  validate(p: Parameters) {
    return validateExtension(p);
  }

  execute(p: Parameters): void {
    p.put(0, p.get(1), null);
  }
}
