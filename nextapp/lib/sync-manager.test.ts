import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { eventsAfter } from "./events";
import { LIBRARY_DIR } from "./env";
import { stageTriggers, startByHand } from "./sync-manager";
import { getMissingSeries, getEpisodes, replaceTmdb, syncedAt } from "./store";

// The library on one disk in a throwaway folder; ffprobe isn't run, and
// TMDB's details aren't asked for (no key).
vi.mock("./env", async (importOriginal) => {
  const os = await import("node:os");
  const fsp = await import("node:fs");
  const p = await import("node:path");
  return {
    ...(await importOriginal<typeof import("./env")>()),
    TMDB_API_KEY: "",
    LIBRARY_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-library-")),
  };
});
vi.mock("./ffprobe", () => ({ ffprobe: async () => ({ seconds: 60, codec: "hevc", languages: ["DE"] }) }));

afterEach(() => {
  for (const entry of fs.readdirSync(LIBRARY_DIR)) fs.rmSync(path.join(LIBRARY_DIR, entry), { recursive: true });
});
afterAll(() => fs.rmSync(LIBRARY_DIR, { recursive: true, force: true }));

// One show (TMDB 10) with these episodes of season 1 on disk.
function library(episodes: number[]) {
  const dir = path.join(LIBRARY_DIR, "nvme01", "shows", "Silo (2023) [tmdbid-10]", "Season 01");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(LIBRARY_DIR, "nvme01", "movies"), { recursive: true });
  for (const n of episodes) fs.writeFileSync(path.join(dir, `Silo.S01E0${n}.mkv`), "video");
}

describe("the library stage", () => {
  it("rechecks what's missing right after, once TMDB was synced", async () => {
    replaceTmdb(
      { "10": { tmdbId: "10", seasons: [{ season: 1, airedEpisodeNumbers: [1, 2], episodeNumbers: [1, 2] }] } },
      {},
      "2026-06-01T00:00:00Z",
    );

    library([1]);
    await stageTriggers.library();
    expect(getMissingSeries()["10"].seasons[0].episodes).toBe("2");

    // Episode 2 arrives: no longer missing, without waiting for a TMDB sync.
    library([1, 2]);
    await stageTriggers.library();
    expect(getEpisodes()).toHaveLength(2);
    expect(getMissingSeries()).toEqual({});
  });

  it("skips the recheck before the first TMDB sync", async () => {
    library([1]);
    await stageTriggers.library();
    expect(syncedAt("missing")).toBeNull();
  });
});

describe("startByHand", () => {
  it("notes a stage started by hand once it's done, the scan's with what the library gained", async () => {
    library([1]);
    startByHand("library");
    await vi.waitFor(() => expect(eventsAfter(0).events).toHaveLength(1));
    expect(eventsAfter(0).events[0]).toMatchObject({
      title: "Library scanned",
      description: "+1 show",
      tone: "success",
    });

    startByHand("library");
    await vi.waitFor(() => expect(eventsAfter(1).events).toHaveLength(1));
    expect(eventsAfter(1).events[0]).toMatchObject({ description: "No changes" });
  });
});
