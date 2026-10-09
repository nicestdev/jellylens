import fs from "fs/promises";
import path from "path";
import { DATA_DIR, JELLYFIN_API_KEY, JELLYFIN_URL } from "./env";
import { authHeaders } from "./jellyfin";
import { dedupe, writeAtomically, type CachedImage } from "./file-cache";

export type { CachedImage };

// Jellyfin posters, fetched server-side and kept on disk so the browser only
// ever talks to Jellylens — JELLYFIN_URL can be a Docker-internal hostname.
// Layout: DATA_DIR/images/<itemId>/<tag>-<height>.<ext>. The tag changes when
// the image does, so a file never goes stale; older tags are dropped on write.
const IMAGE_DIR = path.join(DATA_DIR, "images");

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const EXT: Record<string, string> = Object.fromEntries(Object.entries(TYPES).map(([ext, type]) => [type, ext]));

const inflight = new Map<string, Promise<CachedImage | null>>();

// null: Jellyfin doesn't have it (or can't be reached, or sent no image).
export function getImage(itemId: string, tag: string, height: number): Promise<CachedImage | null> {
  return dedupe(inflight, `${itemId}/${tag}-${height}`, async () => {
    const dir = path.join(IMAGE_DIR, itemId);
    const stem = `${tag}-${height}.`;
    const files = await fs.readdir(dir).catch(() => [] as string[]);
    const hit = files.find((f) => f.startsWith(stem) && TYPES[f.slice(stem.length)]);
    const cached = hit && (await fs.readFile(path.join(dir, hit)).catch(() => null));
    if (cached) return { body: cached, type: TYPES[hit.slice(stem.length)] };

    const url = `${JELLYFIN_URL}/Items/${itemId}/Images/Primary?fillHeight=${height}&quality=90&tag=${tag}`;
    const res = await fetch(url, { headers: { ...authHeaders(JELLYFIN_API_KEY), Accept: "image/*" } }).catch(
      () => null,
    );
    if (!res?.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim();
    if (!EXT[type]) return null;
    const body = Buffer.from(await res.arrayBuffer());

    // Files of an older tag are a replaced image: gone with the new one.
    for (const f of files) if (!f.startsWith(`${tag}-`)) await fs.rm(path.join(dir, f), { force: true });
    await writeAtomically(path.join(dir, `${stem}${EXT[type]}`), body, "images");
    return { body, type };
  });
}

// Drops cached images for items no longer in the library; run after a
// Jellyfin sync.
export async function pruneImages(keepIds: Set<string>) {
  const dirs = await fs.readdir(IMAGE_DIR).catch(() => [] as string[]);
  const gone = dirs.filter((d) => !keepIds.has(d));
  await Promise.all(gone.map((d) => fs.rm(path.join(IMAGE_DIR, d), { recursive: true, force: true })));
  return gone.length;
}
