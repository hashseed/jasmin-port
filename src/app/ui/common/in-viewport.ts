import {
  DestroyRef,
  ElementRef,
  Signal,
  afterNextRender,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { DocumentStore } from '../../services/document-store';

/**
 * Whether the host element is visible: rendered and inside the viewport. False
 * in a hidden document tab, and for a section scrolled out of the narrow layout's
 * column or a pane dragged out of view. Uses an IntersectionObserver; true where
 * there is none. Call in an injection context.
 */
export function inViewport(): Signal<boolean> {
  const visible = signal(true);
  const element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  const destroyRef = inject(DestroyRef);
  afterNextRender(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      visible.set(entries[entries.length - 1].isIntersecting);
    });
    observer.observe(element);
    destroyRef.onDestroy(() => observer.disconnect());
  });
  return visible.asReadonly();
}

/**
 * The document's `version` as a panel that is `visible` follows it. While Run
 * refreshes the panels live (spec 04 §9.3), a panel out of view keeps the version
 * it last showed, so it does no work; it catches up as soon as it is visible
 * again, and when the run stops.
 */
export function liveVersion(doc: Signal<DocumentStore>, visible: Signal<boolean>): Signal<number> {
  return linkedSignal<{ readonly version: number; readonly hidden: boolean }, number>({
    source: () => {
      const store = doc();
      return { version: store.version(), hidden: store.running() && !visible() };
    },
    computation: (source, previous) =>
      source.hidden && previous ? previous.value : source.version,
  });
}
