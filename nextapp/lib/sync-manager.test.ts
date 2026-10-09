import { describe, expect, it } from "vitest";
import { stageTriggers } from "./sync-manager";
import { getMissingSeries, getEpisodes, replaceTmdb, syncedAt } from "./store";
import { json, mockFetch } from "@/test/http";

// A Jellyfin with one admin and one show of which episode 1 is owned.
function jellyfin(episodes: number[]) {
  return mockFetch((url) => {
    if (url.pathname === "/Users") return json([{ Id: "admin", Name: "Admin", Policy: { IsAdministrator: true } }]);
    if (url.pathname !== "/Users/admin/Items") return;
    const type = url.searchParams.get("IncludeItemTypes");
    if (type === "Series") return json({ Items: [{ Id: "s", Name: "Silo", ProviderIds: { Tmdb: "10" } }] });
    if (type === "Episode") {
      return json({
        Items: episodes.map((n) => ({ Id: "e" + n, Name: "E", SeriesId: "s", ParentIndexNumber: 1, IndexNumber: n })),
      });
    }
    return json({ Items: [] });
  });
}

describe("the Jellyfin stage", () => {
  it("rechecks what's missing right after, once TMDB was synced", async () => {
    replaceTmdb(
      { s: { tmdbId: "10", seasons: [{ season: 1, airedEpisodeNumbers: [1, 2], episodeNumbers: [1, 2] }] } },
      {},
      "2026-06-01T00:00:00Z",
    );

    jellyfin([1]);
    await stageTriggers.jellyfin();
    expect(getMissingSeries().s.seasons[0].episodes).toBe("2");

    // Episode 2 arrives: no longer missing, without waiting for a TMDB sync.
    jellyfin([1, 2]);
    await stageTriggers.jellyfin();
    expect(getEpisodes()).toHaveLength(2);
    expect(getMissingSeries()).toEqual({});
  });

  it("skips the recheck before the first TMDB sync", async () => {
    jellyfin([1]);
    await stageTriggers.jellyfin();
    expect(syncedAt("missing")).toBeNull();
  });
});
