import type { LogEntry, LogLevel, LogsResponse } from "@/lib/api-types";
import type { LogArea } from "@/lib/log-areas";

// Made-up log lines (lib/mock/fetch.ts), every level and most areas, the
// newest a minute ago, the oldest two days back.
const LINES: [minutesAgo: number, LogLevel, LogArea, string][] = [
  [
    1,
    "info",
    "downloads",
    "Downloaded Heat.1995.German.DL.1080p.BluRay.x265-VECTOR.mkv in 2 min 4 s · 6.21 GB · 51.20 MB/s",
  ],
  [3, "warn", "downloads", "Connection dropped on 642468e2.part2.rar at 1.12 GB, resuming: terminated"],
  [5, "info", "downloads", "Started: Heat.1995.German.DL.1080p.BluRay.x265-VECTOR · new to the library"],
  [5, "info", "downloads", "Matched Heat.1995.German.DL.1080p.BluRay.x265-VECTOR · Heat (1995) · TMDB movie 949"],
  [6, "info", "wcx", "Added Heat.1995.German.DL.1080p.BluRay.x265-VECTOR · rapidgator (hide.cx) · 3 files"],
  [6, "info", "wcx", "Mirror offline: ddownload (wcx) of Heat.1995.German.DL.1080p.BluRay.x265-VECTOR"],
  [
    12,
    "info",
    "organize",
    "Replaced in 1 min 12 s: Unabomber.2026.German.AC3.DL.1080p.Web.x265-FuN · to nvme01/movies/UNABOMBER (2026) [tmdbid-1492640] · 1 file · took out UNABOMBER.2026.German.DL.Atmos.1080p.NF.WEB.H265-ZeroTwo.mkv",
  ],
  [14, "info", "jellyfin", "Asked Jellyfin to scan its libraries"],
  [
    20,
    "error",
    "downloads",
    "Package failed: Crystal.Lake.2026.S01.German.DL.EAC3.1080p.HMAX.WEB.H265-WAREZCX Crystal.Lake.S01.part3.rar: Wrong archive password",
  ],
  [
    21,
    "info",
    "downloads",
    "Waits for a hand: The.Night.Manager.S02.GERMAN.AAC.1080p.BluRay.x265-w00t · the library has some of it",
  ],
  [
    22,
    "info",
    "downloads",
    "Peeked into TeLa1080S04E01.rar · holds The.Last.of.Us.S02E01.German.DL.1080p.WEB.h264-WvF.mkv",
  ],
  [40, "error", "xrel", "Releases sync failed after 6.4 s: xREL rate limit reached, try again in 28 minutes"],
  [
    40,
    "warn",
    "xrel",
    "Hourly limit reached on /p2p/releases.json calls=3 remaining=8 resetAt=2026-10-17T05:00:00.000Z",
  ],
  [41, "info", "xrel", "Releases sync started"],
  [30, "warn", "xrel", "Too many searches at once on /search/releases.json, asking again in 5 s remaining=887"],
  [65, "warn", "tmdb", "Seasons of show 1399 failed, kept the last sync's: TMDB answered HTTP 503"],
  [66, "info", "tmdb", "TMDB sync done in 9.7 s shows=257 failed=1"],
  [70, "warn", "library", "2 folders without [tmdbid-N]: nvme02/movies/Heat (1995), nvme03/shows/Dark"],
  [71, "info", "library", "Library scan done in 3.3 s movies=719 shows=257 episodes=11447 untagged=2 unnamed=0"],
  [1450, "warn", "auth", 'Wrong password for "guest" from 10.0.0.40'],
  [1452, "info", "auth", "anna signed in from 10.0.0.21"],
  [1500, "info", "wishlist", "anna wishlisted Dune: Part Two · TMDB movie 693134"],
  [1520, "info", "match", "Verdict on e1~1995: wrong"],
  [1600, "info", "settings", "Parallel downloads set to 3"],
  [3000, "error", "images", "Caching w342/abc.jpg (tmdb-images) failed: ENOSPC: no space left on device"],
  [
    3100,
    "info",
    "app",
    "Started Jellylens 1.4.0 (updated from 1.3.0) · Node 24.22.0 · TZ Europe/Vienna · host 3f2a9c1d7b44",
  ],
  [3101, "info", "db", "Migrated from schema version 4 to 5"],
];

export function mockLogs(url: URL): LogsResponse {
  const p = url.searchParams;
  // One page: nothing newer to poll for, nothing older to load.
  if (p.has("after") || p.has("before")) return { entries: [], more: false };
  const levels = p.get("level")?.split(",") ?? [];
  const areas = p.get("area")?.split(",") ?? [];
  const words = (p.get("q") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const entries: LogEntry[] = LINES.map(([ago, level, area, message], i) => ({
    id: LINES.length - i,
    at: new Date(Date.now() - ago * 60_000).toISOString(),
    level,
    area,
    message,
  })).filter(
    (e) =>
      (!levels.length || levels.includes(e.level)) &&
      (!areas.length || areas.includes(e.area)) &&
      words.every((w) => `${e.message} ${e.area}`.toLowerCase().includes(w)),
  );
  return { entries, more: false };
}
