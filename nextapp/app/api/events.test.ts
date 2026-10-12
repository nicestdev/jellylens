import { describe, expect, it } from "vitest";
import type { EventsResponse } from "@/lib/api-types";
import { notify } from "@/lib/events";

// GET /api/events: where to start, what came after, and everything there
// is for a page that knew another run of the server.
const get = async (query = "") => {
  const { GET } = await import("./events/route");
  return (await (await GET(new Request(`http://jellylens.test/api/events${query}`))).json()) as EventsResponse;
};

describe("/api/events", () => {
  it("has only where to start without after, then what came after it", async () => {
    notify("Downloaded");
    const start = await get();
    expect(start).toEqual({ boot: expect.any(String), last: 1, events: [] });
    notify("Moved into the library");
    const next = await get(`?after=${start.last}&boot=${start.boot}`);
    expect(next.events.map((e) => e.title)).toEqual(["Moved into the library"]);
  });

  it("hands out every event since a restart to a page that knew the run before", async () => {
    notify("Library scan failed", { tone: "error" });
    const r = await get("?after=7&boot=an-earlier-run");
    expect(r.events.map((e) => e.title)).toEqual(["Library scan failed"]);
  });
});
