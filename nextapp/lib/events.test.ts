import { describe, expect, it } from "vitest";
import { eventsAfter, notify } from "./events";

describe("events", () => {
  it("hands out what came after an id, and the last id", () => {
    expect(eventsAfter(Infinity)).toEqual({ last: 0, events: [] });
    notify("Downloaded", { description: "Heat (1995)", tone: "success" });
    notify("Move failed", { tone: "error" });
    expect(eventsAfter(0)).toEqual({
      last: 2,
      events: [
        { id: 1, title: "Downloaded", description: "Heat (1995)", tone: "success" },
        { id: 2, title: "Move failed", description: undefined, tone: "error" },
      ],
    });
    expect(eventsAfter(2)).toEqual({ last: 2, events: [] });
    expect(eventsAfter(Infinity).events).toEqual([]);
  });

  it("keeps only the last 50", () => {
    for (let i = 0; i < 60; i++) notify(`Event ${i}`);
    const { last, events } = eventsAfter(0);
    expect(last).toBe(60);
    expect(events).toHaveLength(50);
    expect(events[0].title).toBe("Event 10");
  });
});
