import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissToast, getToasts, pauseToast, resumeToast, subscribeToasts, toast } from "./toast";

afterEach(() => {
  for (const t of getToasts()) dismissToast(t.id);
  vi.useRealTimers();
});

describe("toast", () => {
  it("adds a note, plain unless told otherwise, and tells the listeners", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    toast("Saved");
    toast("Added to your wishlist", { description: "Heat (1995)", tone: "success" });
    expect(getToasts().map(({ title, description, tone }) => ({ title, description, tone }))).toEqual([
      { title: "Saved", description: undefined, tone: "plain" },
      { title: "Added to your wishlist", description: "Heat (1995)", tone: "success" },
    ]);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    toast("Unheard");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps at most three, dropping the oldest", () => {
    for (const title of ["1", "2", "3", "4"]) toast(title);
    expect(getToasts().map((t) => t.title)).toEqual(["2", "3", "4"]);
  });

  it("goes away by itself after a few seconds, or when dismissed", () => {
    vi.useFakeTimers();
    toast("First");
    vi.advanceTimersByTime(1000);
    toast("Second");
    dismissToast(getToasts()[1].id);
    expect(getToasts().map((t) => t.title)).toEqual(["First"]);
    vi.advanceTimersByTime(1000);
    expect(getToasts()).toEqual([]);
  });

  it("holds its countdown while paused and goes on with the time it had left", () => {
    vi.useFakeTimers();
    toast("Held");
    const { id } = getToasts()[0];
    vi.advanceTimersByTime(1500);
    pauseToast(id);
    vi.advanceTimersByTime(10_000);
    expect(getToasts()).toHaveLength(1);
    resumeToast(id);
    vi.advanceTimersByTime(400);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(100);
    expect(getToasts()).toEqual([]);
  });
});
