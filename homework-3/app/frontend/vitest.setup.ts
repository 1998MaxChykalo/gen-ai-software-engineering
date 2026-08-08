import "@testing-library/jest-dom/vitest";

// recharts' <ResponsiveContainer> observes its DOM node's size; jsdom has no
// ResizeObserver implementation, so tests that render a chart need a stub.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
