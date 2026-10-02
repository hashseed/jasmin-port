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

/**
 * A scheduler the test drives by hand: `slice()` runs Run's next time slice
 * (every `now()` call takes 1 ms), `frame()` renders a frame.
 */
export class HandScheduler implements Scheduler {
  private time = 0;
  private timers: (() => void)[] = [];
  private frames: (() => void)[] = [];

  setTimeout(callback: () => void): unknown {
    this.timers.push(callback);
    return callback;
  }
  clearTimeout(handle: unknown): void {
    this.timers = this.timers.filter((callback) => callback !== handle);
  }
  now(): number {
    return this.time++;
  }
  requestFrame(callback: () => void): unknown {
    this.frames.push(callback);
    return callback;
  }
  cancelFrame(handle: unknown): void {
    this.frames = this.frames.filter((callback) => callback !== handle);
  }

  slice(): void {
    this.timers.shift()?.();
  }
  frame(): void {
    const frames = this.frames;
    this.frames = [];
    for (const callback of frames) callback();
  }
}

/** A session on a {@link HandScheduler} that refreshes live after every slice. */
export function handSession(text: string): { session: MachineSession; scheduler: HandScheduler } {
  const scheduler = new HandScheduler();
  const session = new MachineSession(undefined, scheduler, {
    sliceMs: 5,
    batchSteps: 10,
    liveRefreshMs: 0,
  });
  session.setText(text);
  return { session, scheduler };
}
