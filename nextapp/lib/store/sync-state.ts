import { one, run } from "./sql";

// When each sync stage last finished (null = never). The mismatch check is
// part of the missing recheck, so it shares that one.
type Stage = "library" | "tmdb" | "missing" | "releases";

export function syncedAt(stage: Stage): string | null {
  return one<{ synced_at: string }>("SELECT synced_at FROM sync_state WHERE stage = ?", stage)?.synced_at ?? null;
}

export function setSyncedAt(stage: Stage, at: string | null) {
  if (!at) return;
  run(
    "INSERT INTO sync_state (stage, synced_at) VALUES (?, ?) ON CONFLICT (stage) DO UPDATE SET synced_at = excluded.synced_at",
    stage,
    at,
  );
}
