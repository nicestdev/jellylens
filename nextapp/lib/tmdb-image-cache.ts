import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "./env";
import { dedupe, writeAtomically, type CachedImage } from "./file-cache";

// TMDB posters (Requests, Missing, Releases), fetched server-side on first
// view and kept on disk, so browsers only ever talk to Jellylens and one
// poster shown on several pages is downloaded once. TMDB never changes the
// image behind a path (a new image gets a new path), so files never go
// stale. Layout: DATA_DIR/tmdb-images/<size>/<file>.
const IMAGE_DIR = path.join(DATA_DIR, "tmdb-images");

// The sizes the pages ask for; anything else is refused, so callers can't
// fill the disk with one-off variants.
const TMDB_SIZES = ["w185", "w342"] as const;
type TmdbSize = (typeof TMDB_SIZES)[number];
export const isTmdbSize = (size: string): size is TmdbSize => (TMDB_SIZES as readonly string[]).includes(size);

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const typeOf = (file: string) => TYPES[file.slice(file.lastIndexOf(".") + 1)];

// A TMDB image file name as it appears in poster paths ("/abc123.jpg").
export const isTmdbImageFile = (file: string) => /^[A-Za-z0-9_-]{1,64}\.(jpg|png|webp)$/.test(file);

const inflight = new Map<string, Promise<CachedImage | null>>();

// null: TMDB doesn't have it (or can't be reached).
export function getTmdbImage(size: TmdbSize, file: string): Promise<CachedImage | null> {
  const target = path.join(IMAGE_DIR, size, file);
  return dedupe(inflight, size + "/" + file, async () => {
    const cached = await fs.readFile(target).catch(() => null);
    if (cached) return { body: cached, type: typeOf(file) };
    const res = await fetch(`https://image.tmdb.org/t/p/${size}/${file}`).catch(() => null);
    if (!res?.ok) return null;
    const body = Buffer.from(await res.arrayBuffer());
    await writeAtomically(target, body, "tmdb-images");
    return { body, type: typeOf(file) };
  });
}

// Posters only search and trending results showed (nothing stored points
// at them) stay this long, so browsing Requests doesn't fetch them again
// after every sync.
const UNREFERENCED_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Drops cached posters nothing stored shows anymore (a removed release
// group, a request taken back) once they're past UNREFERENCED_TTL_MS, and
// leftovers of interrupted writes just the same. keep: paths like
// "/abc.jpg"; run after the TMDB and releases syncs.
export async function pruneTmdbImages(keep: Set<string>, now = Date.now()) {
  const cutoff = now - UNREFERENCED_TTL_MS;
  let removed = 0;
  for (const size of TMDB_SIZES) {
    const dir = path.join(IMAGE_DIR, size);
    for (const file of await fs.readdir(dir).catch(() => [] as string[])) {
      if (keep.has("/" + file)) continue;
      const stat = await fs.stat(path.join(dir, file)).catch(() => null);
      if (!stat || stat.mtimeMs > cutoff) continue;
      await fs.rm(path.join(dir, file), { force: true });
      removed++;
    }
  }
  if (removed) console.log("[tmdb-images] pruned " + removed + " unused posters");
  return removed;
}
