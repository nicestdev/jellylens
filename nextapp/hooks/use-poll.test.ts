// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import "@/test/dom";
import { usePoll } from "./use-poll";

let hidden = false;
beforeEach(() => {
  hidden = false;
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => (hidden ? "hidden" : "visible"));
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});
afterEach(() => vi.useRealTimers());

const show = (visible: boolean) => {
  hidden = !visible;
  document.dispatchEvent(new Event("visibilitychange"));
};

describe("usePoll", () => {
  it("calls back every delay, a new one counting from when it's set", async () => {
    const refresh = vi.fn();
    const { rerender } = renderHook(({ ms }) => usePoll(refresh, ms), { initialProps: { ms: 15000 as number | null } });
    await vi.advanceTimersByTimeAsync(15000);
    expect(refresh).toHaveBeenCalledTimes(1);
    // A sync starts 5 s into the slow wait: the next call comes 2 s later.
    await vi.advanceTimersByTimeAsync(5000);
    rerender({ ms: 2000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(refresh).toHaveBeenCalledTimes(4);
    rerender({ ms: null });
    await vi.advanceTimersByTimeAsync(60000);
    expect(refresh).toHaveBeenCalledTimes(4);
  });

  it("waits for a slow call before the next", async () => {
    let finish = () => {};
    const refresh = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    renderHook(() => usePoll(refresh, 1000));
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(1000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("skips calls while the tab is hidden and catches up when it shows", async () => {
    const refresh = vi.fn();
    renderHook(() => usePoll(refresh, 15000));
    show(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(refresh).not.toHaveBeenCalled();
    show(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("keeps going after a failed call, and stops when unmounted", async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error("down"));
    const { unmount } = renderHook(() => usePoll(refresh, 1000));
    await vi.advanceTimersByTimeAsync(2000);
    expect(refresh).toHaveBeenCalledTimes(2);
    unmount();
    await vi.advanceTimersByTimeAsync(5000);
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});
