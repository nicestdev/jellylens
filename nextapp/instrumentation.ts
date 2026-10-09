// Next's documented hook for "run once when the server starts": open the
// database (creating or migrating it), resolve the Jellyfin admin user, run
// the initial jellyfin -> tmdb (-> missing, chained inside triggerTmdbSync)
// sync chain and, beside it, the xREL releases sync, then schedule each
// stage's own independent interval (from the *_INTERVAL_HOURS env vars —
// see lib/sync-manager.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { db } = await import("./lib/db");
  const { ensureJellyfinUser, triggerJellyfinSync, triggerTmdbSync, triggerReleasesSync, applySchedules } =
    await import("./lib/sync-manager");
  const { JELLYFIN_URL, JELLYFIN_API_KEY } = await import("./lib/env");

  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
    console.error("JELLYFIN_URL and JELLYFIN_API_KEY are required.");
    return;
  }

  db();
  await ensureJellyfinUser();

  triggerJellyfinSync()
    .then(() => triggerTmdbSync())
    .catch(() => {}); // already logged by makeTrigger
  triggerReleasesSync().catch(() => {});

  applySchedules();

  const { resumeDownloads } = await import("./lib/downloader");
  resumeDownloads();
}
