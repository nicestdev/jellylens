// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "@/test/dom";
import { useWindowEvent } from "./use-window-event";

const fire = (detail: unknown) => window.dispatchEvent(new CustomEvent("jellylens:test", { detail }));

describe("useWindowEvent", () => {
  it("hands each event's detail to the latest handler, and stops when unmounted", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender, unmount } = renderHook(({ fn }) => useWindowEvent("jellylens:test", fn), {
      initialProps: { fn: first },
    });
    fire(1);
    rerender({ fn: second });
    fire(2);
    unmount();
    fire(3);
    expect(first.mock.calls).toEqual([[1]]);
    expect(second.mock.calls).toEqual([[2]]);
  });
});
