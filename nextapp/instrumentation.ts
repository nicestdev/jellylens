// Next's documented hook for "run once when the server starts": open the
// database (creating or migrating it), run the initial library scan -> tmdb
// (-> missing, chained inside triggerTmdbSync) chain and, beside it, the
// xREL releases sync, then schedule each stage's own independent interval
// (from the *_INTERVAL_HOURS env vars — see lib/sync-manager.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { db } = await import("./lib/db");
  const { triggerLibraryScan, triggerTmdbSync, triggerReleasesSync, applySchedules } =
    await import("./lib/sync-manager");
  const { JELLYFIN_URL, JELLYFIN_API_KEY, AUTH_ENABLED } = await import("./lib/env");

  // Jellyfin is only asked for sign-in, the metadata language and to
  // rescan after an import.
  if (AUTH_ENABLED && (!JELLYFIN_URL || !JELLYFIN_API_KEY)) {
    console.error("JELLYFIN_URL and JELLYFIN_API_KEY are required for sign-in (or set AUTH_ENABLED=false).");
  }

  db();

  triggerLibraryScan()
    .then(() => triggerTmdbSync())
    .catch(() => {}); // already logged by makeTrigger
  triggerReleasesSync().catch(() => {});

  applySchedules();

  const { resumeDownloads } = await import("./lib/downloader");
  resumeDownloads();
}
