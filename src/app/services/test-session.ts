import { MachineConfig, MachineSession, Scheduler } from '../core';

/** A scheduler whose timers never fire: a started Run stays running until paused. */
export class FrozenScheduler implements Scheduler {
  setTimeout(): unknown {
    return 1;
  }
  clearTimeout(): void {
    // Nothing is ever scheduled for real.
  }
  now(): number {
    return 0;
  }
}

/** SESSION_FACTORY for tests: sessions that can be put into the running state. */
export const frozenSessionFactory = (config: MachineConfig) =>
  new MachineSession(config, new FrozenScheduler());
