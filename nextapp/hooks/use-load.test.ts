// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import "@/test/dom";
import { useLoad } from "./use-load";

describe("useLoad", () => {
  it("loads on mount and again on reload, keeping the data through a failure", async () => {
    const load = vi
      .fn()
      .mockResolvedValueOnce(["a"])
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(["b"]);
    const { result } = renderHook(() => useLoad(load));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(["a"]));
    expect(result.current.loading).toBe(false);

    await act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: ["a"], error: "offline" });

    await act(() => result.current.reload());
    expect(result.current).toMatchObject({ data: ["b"], error: "" });
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("drops an answer that comes after a newer load's, or after setData", async () => {
    const pending: ((v: string) => void)[] = [];
    const { result } = renderHook(() => useLoad(() => new Promise<string>((resolve) => pending.push(resolve))));
    // The mount's load and a reload, answered in the wrong order.
    act(() => void result.current.reload());
    await act(async () => pending[1]("new"));
    await act(async () => pending[0]("old"));
    expect(result.current.data).toBe("new");

    // A poll asked before an action, answered after the action's answer.
    act(() => void result.current.reload());
    act(() => result.current.setData("from the action"));
    await act(async () => pending[2]("before the action"));
    expect(result.current).toMatchObject({ data: "from the action", loading: false });
  });

  it("ignores a load that finishes after unmounting", async () => {
    let finish!: (v: string) => void;
    const { result, unmount } = renderHook(() => useLoad(() => new Promise<string>((resolve) => (finish = resolve))));
    unmount();
    await act(async () => finish("late"));
    expect(result.current.data).toBeNull();
  });
});
