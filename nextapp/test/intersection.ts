import { vi } from "vitest";

// happy-dom has no layout, so nothing ever scrolls into view: this stands in
// for IntersectionObserver, and scrollToEnd() tells every element still
// watched that it's in view now, as scrolling to the end of a list would.
export function mockIntersection() {
  const observers = new Set<{ callback: IntersectionObserverCallback; targets: Set<Element> }>();
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private entry = { callback: (() => {}) as IntersectionObserverCallback, targets: new Set<Element>() };
      constructor(callback: IntersectionObserverCallback) {
        this.entry.callback = callback;
        observers.add(this.entry);
      }
      observe(el: Element) {
        this.entry.targets.add(el);
      }
      disconnect() {
        observers.delete(this.entry);
      }
    },
  );
  return {
    scrollToEnd() {
      for (const { callback, targets } of [...observers]) {
        const entries = [...targets].map((target) => ({ target, isIntersecting: true }) as IntersectionObserverEntry);
        if (entries.length) callback(entries, {} as IntersectionObserver);
      }
    },
  };
}
