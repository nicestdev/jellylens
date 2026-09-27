// Next's documented hook for "run once when the server starts" — the
// equivalent of what the old Express server did in its app.listen() callback:
// load the persisted cache, resolve the Jellyfin admin user, run the initial
// jellyfin -> tmdb (-> missing, chained inside triggerTmdbSync) sync chain,
// then schedule each stage's own independent interval (from the
// *_INTERVAL_HOURS env vars — see lib/sync-manager.ts).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { load } = await import("./lib/store");
  const { ensureJellyfinUser, triggerJellyfinSync, triggerTmdbSync, applySchedules } = await import(
    "./lib/sync-manager"
  );
  const { JELLYFIN_URL, JELLYFIN_API_KEY } = await import("./lib/env");

  if (!JELLYFIN_URL || !JELLYFIN_API_KEY) {
    console.error("JELLYFIN_URL and JELLYFIN_API_KEY are required.");
    return;
  }

  load();
  await ensureJellyfinUser();

  triggerJellyfinSync()
    .then(() => triggerTmdbSync())
    .catch(() => {}); // already logged by makeTrigger

  applySchedules();
}
