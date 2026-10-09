// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import "@/test/dom";
import { useStoredChoice } from "./use-stored-choice";

const LAYOUTS = ["list", "grid"] as const;

beforeEach(() => localStorage.clear());

describe("useStoredChoice", () => {
  it("starts with the fallback, remembers a pick, and starts with it next time", () => {
    const first = renderHook(() => useStoredChoice("jellylens.layout.test", LAYOUTS, "list"));
    expect(first.result.current[0]).toBe("list");
    act(() => first.result.current[1]("grid"));
    expect(first.result.current[0]).toBe("grid");
    expect(localStorage.getItem("jellylens.layout.test")).toBe("grid");
    first.unmount();

    const again = renderHook(() => useStoredChoice("jellylens.layout.test", LAYOUTS, "list"));
    expect(again.result.current[0]).toBe("grid");
  });

  it("ignores a stored value that isn't an option", () => {
    localStorage.setItem("jellylens.layout.odd", "table");
    const { result } = renderHook(() => useStoredChoice("jellylens.layout.odd", LAYOUTS, "list"));
    expect(result.current[0]).toBe("list");
  });

  it("can start with nothing picked, for a page to choose (Missing lands on the library with gaps)", () => {
    const { result } = renderHook(() => useStoredChoice("jellylens.missing.test", LAYOUTS, null));
    expect(result.current[0]).toBeNull();
    act(() => result.current[1]("grid"));
    expect(result.current[0]).toBe("grid");
  });

  it("still switches where storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useStoredChoice("jellylens.layout.blocked", LAYOUTS, "list"));
    act(() => result.current[1]("grid"));
    expect(result.current[0]).toBe("grid");
    vi.restoreAllMocks();
  });
});
