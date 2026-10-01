import { afterEach, describe, expect, it, vi } from "vitest";
import { makeTrigger, setSchedule, start } from "./scheduler";

describe("makeTrigger", () => {
  it("shares one run between overlapping calls", async () => {
    let finish!: (value: number) => void;
    const fn = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    const trigger = makeTrigger("test", fn);

    const a = trigger();
    const b = trigger();
    finish(42);

    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shares the run with another copy of the module (boot hook vs. routes)", async () => {
    let finish!: (value: number) => void;
    const fn = vi.fn(() => new Promise<number>((resolve) => (finish = resolve)));
    const boot = makeTrigger("test", fn);
    const route = makeTrigger("test", fn);

    const a = boot();
    expect(route.running()).toBe(true);
    const b = route();
    finish(42);

    expect(await b).toBe(42);
    expect(await a).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(route.running()).toBe(false);
  });

  it("runs again once the last run ended, even after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fn = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    const trigger = makeTrigger("test", fn);

    await expect(trigger()).rejects.toThrow("boom");
    expect(await trigger()).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("setSchedule", () => {
  afterEach(() => {
    setSchedule("test", 0, async () => {});
    vi.useRealTimers();
  });

  it("runs every interval, and a new schedule replaces the old one", async () => {
    vi.useFakeTimers();
    const first = vi.fn(async () => {});
    const second = vi.fn(async () => {});

    setSchedule("test", 2, first);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(first).toHaveBeenCalledTimes(1);

    setSchedule("test", 1, second);
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("turns off with 0 hours", async () => {
    vi.useFakeTimers();
    const run = vi.fn(async () => {});
    setSchedule("test", 1, run);
    setSchedule("test", 0, run);
    await vi.advanceTimersByTimeAsync(5 * 60 * 60 * 1000);
    expect(run).not.toHaveBeenCalled();
  });

  it("doesn't let a failed run escape as an unhandled rejection", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      setSchedule("test", 1, async () => {
        throw new Error("sync failed");
      });
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});

describe("trigger state", () => {
  it("says whether a run is going and how the last one failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let finish!: () => void;
    const trigger = makeTrigger("test", vi
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)))
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(undefined));

    const run = trigger();
    expect(trigger.running()).toBe(true);
    finish();
    await run;
    expect(trigger.running()).toBe(false);
    expect(trigger.lastError()).toBeNull();

    await trigger().catch(() => {});
    expect(trigger.lastError()).toBe("boom");
    await trigger();
    expect(trigger.lastError()).toBeNull();
  });

  it("start() runs without waiting and keeps a failure off the process", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const trigger = makeTrigger("test", async () => {
      throw new Error("sync failed");
    });
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      start(trigger);
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
      expect(trigger.lastError()).toBe("sync failed");
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
