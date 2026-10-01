import { describe, expect, it } from "vitest";
import { runSync } from "./api-client";
import { json, mockFetch } from "@/test/http";

const stage = (running: boolean, error: string | null = null) => ({ syncedAt: null, running, error });

function server(statuses: ReturnType<typeof stage>[]) {
  let polls = 0;
  return mockFetch((url) => {
    if (url.pathname === "/api/sync/tmdb") return json({ running: true }, { status: 202 });
    if (url.pathname === "/api/status") return json({ tmdb: statuses[Math.min(polls++, statuses.length - 1)] });
  });
}

describe("runSync", () => {
  it("starts a stage and waits until it's done", async () => {
    const fetch = server([stage(true), stage(true), stage(false)]);
    await runSync("tmdb", 1);
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual([
      "/api/sync/tmdb",
      "/api/status",
      "/api/status",
      "/api/status",
    ]);
  });

  it("throws the stage's error", async () => {
    server([stage(false, "TMDB returned HTTP 401")]);
    await expect(runSync("tmdb", 1)).rejects.toThrow("TMDB returned HTTP 401");
  });
});
