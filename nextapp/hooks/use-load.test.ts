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

  it("ignores a load that finishes after unmounting", async () => {
    let finish!: (v: string) => void;
    const { result, unmount } = renderHook(() => useLoad(() => new Promise<string>((resolve) => (finish = resolve))));
    unmount();
    await act(async () => finish("late"));
    expect(result.current.data).toBeNull();
  });
});
