import fs from "fs/promises";
import path from "path";
import { DATA_DIR } from "./store";
import { JELLYFIN_URL, JELLYFIN_API_KEY } from "./env";
import { authHeaders } from "./jellyfin";

// Jellyfin posters, fetched server-side and kept on disk so the browser only
// ever talks to Jellylens — JELLYFIN_URL can be a Docker-internal hostname.
// Layout: DATA_DIR/images/<itemId>/<tag>-<height>.<ext>. The tag changes when
// the image does, so a file never goes stale; older tags are dropped on write.
const IMAGE_DIR = path.join(DATA_DIR, "images");

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

export type CachedImage = { body: Buffer; type: string };

// Concurrent requests for the same uncached image share one Jellyfin fetch.
const inflight = new Map<string, Promise<CachedImage | null>>();

export function getImage(itemId: string, tag: string, height: number): Promise<CachedImage | null> {
  const key = `${itemId}/${tag}-${height}`;
  let pending = inflight.get(key);
  if (!pending) {
    pending = readCached(itemId, tag, height)
      .then((hit) => hit ?? fetchAndStore(itemId, tag, height))
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

async function readCached(itemId: string, tag: string, height: number): Promise<CachedImage | null> {
  const stem = `${tag}-${height}.`;
  const files = await fs.readdir(path.join(IMAGE_DIR, itemId)).catch(() => [] as string[]);
  const file = files.find((f) => f.startsWith(stem) && TYPES[f.slice(stem.length)]);
  if (!file) return null;
  const body = await fs.readFile(path.join(IMAGE_DIR, itemId, file)).catch(() => null);
  return body ? { body, type: TYPES[file.slice(stem.length)] } : null;
}

async function fetchAndStore(itemId: string, tag: string, height: number): Promise<CachedImage | null> {
  const url = `${JELLYFIN_URL}/Items/${itemId}/Images/Primary?fillHeight=${height}&quality=90&tag=${tag}`;
  const res = await fetch(url, { headers: { ...authHeaders(JELLYFIN_API_KEY), Accept: "image/*" } }).catch(() => null);
  if (!res?.ok) return null;
  const type = (res.headers.get("content-type") || "").split(";")[0].trim();
  const ext = EXT[type];
  if (!ext) return null;
  const body = Buffer.from(await res.arrayBuffer());

  const dir = path.join(IMAGE_DIR, itemId);
  try {
    await fs.mkdir(dir, { recursive: true });
    for (const f of await fs.readdir(dir)) {
      if (!f.startsWith(`${tag}-`)) await fs.rm(path.join(dir, f), { force: true });
    }
    // write-then-rename so a concurrent reader never sees a half-written file
    const file = path.join(dir, `${tag}-${height}.${ext}`);
    await fs.writeFile(file + ".tmp", body);
    await fs.rename(file + ".tmp", file);
  } catch (e) {
    console.error("[images] failed to cache", itemId, (e as Error).message);
  }
  return { body, type };
}

// Drops cached images for items no longer in the library; run after a Jellyfin sync.
export async function pruneImages(keepIds: Set<string>) {
  const dirs = await fs.readdir(IMAGE_DIR).catch(() => [] as string[]);
  await Promise.all(
    dirs.filter((d) => !keepIds.has(d)).map((d) => fs.rm(path.join(IMAGE_DIR, d), { recursive: true, force: true }))
  );
}
