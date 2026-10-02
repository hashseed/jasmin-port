/**
 * An IntersectionObserver for tests (jsdom has none): `install()` replaces the
 * global one, `show(visible)` reports every observed element as shown or hidden.
 */
export class FakeIntersectionObserver {
  private static observers: FakeIntersectionObserver[] = [];
  private readonly targets: Element[] = [];

  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeIntersectionObserver.observers.push(this);
  }

  observe(target: Element): void {
    this.targets.push(target);
  }

  disconnect(): void {
    this.targets.length = 0;
  }

  static install(): void {
    FakeIntersectionObserver.observers = [];
    Object.assign(globalThis, { IntersectionObserver: FakeIntersectionObserver });
  }

  static uninstall(): void {
    delete (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver;
  }

  static show(visible: boolean): void {
    for (const observer of FakeIntersectionObserver.observers) {
      const entries = observer.targets.map(
        (target) => ({ target, isIntersecting: visible }) as IntersectionObserverEntry,
      );
      if (entries.length) observer.callback(entries, observer as unknown as IntersectionObserver);
    }
  }
}
