import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./async";

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("mapWithConcurrency", () => {
  it("keeps the items' order, however long each takes", async () => {
    const result = await mapWithConcurrency([30, 5, 20, 1], 2, async (ms, i) => {
      await tick(ms);
      return `${i}:${ms}`;
    });
    expect(result).toEqual(["0:30", "1:5", "2:20", "3:1"]);
  });

  it("never has more than the limit in flight, and uses all of it", async () => {
    let running = 0;
    let most = 0;
    await mapWithConcurrency(
      Array.from({ length: 10 }, (_, i) => i),
      3,
      async () => {
        running++;
        most = Math.max(most, running);
        await tick(2);
        running--;
      },
    );
    expect(most).toBe(3);
  });

  it("runs every item once, with a limit above the count too", async () => {
    const seen: number[] = [];
    await mapWithConcurrency([1, 2, 3], 10, async (n) => {
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3]);
  });

  it("is empty for no items", async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it("rejects when a call does", async () => {
    await expect(
      mapWithConcurrency([1, 2, 3], 2, async (n) => {
        if (n === 2) throw new Error("boom");
        return n;
      }),
    ).rejects.toThrow("boom");
  });
});
