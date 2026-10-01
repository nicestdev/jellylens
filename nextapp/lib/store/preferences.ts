import { fromJson, toJson, tx } from "../db";
import { all, run } from "./sql";

// Display options an admin sets on the Settings page. Unlike the env-var
// config, these are changed at runtime, so they live in the database.
// showFileNames: owned movies' file names on the Missing page's collection
// cards (to match the release group); off, they aren't sent at all.
// showSdReleases: releases below 720p on the Releases page (see
// SD_QUALITIES in ./releases); off, they're kept but left out.
export type Preferences = { showFileNames: boolean; showSdReleases: boolean };
const DEFAULT_PREFERENCES: Preferences = { showFileNames: false, showSdReleases: false };

export function getPreferences(): Preferences {
  const stored = all<{ key: string; value: string }>("SELECT key, value FROM preferences");
  return { ...DEFAULT_PREFERENCES, ...Object.fromEntries(stored.map((r) => [r.key, fromJson(r.value)])) };
}

export function setPreferences(changes: Partial<Preferences>) {
  tx(() => {
    for (const [key, value] of Object.entries(changes)) {
      run(
        "INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        key,
        toJson(value)
      );
    }
  });
}
