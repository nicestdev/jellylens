import fs from "fs/promises";
import path from "path";

// Shared by the image caches (lib/tmdb-image-cache.ts).

export type CachedImage = { body: Buffer; type: string };

// Concurrent calls for the same key share one run of load.
export function dedupe<T>(inflight: Map<string, Promise<T>>, key: string, load: () => Promise<T>): Promise<T> {
  let pending = inflight.get(key);
  if (!pending) {
    pending = load().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  return pending;
}

// Write-then-rename, so a concurrent reader never sees a half-written file.
// A failed write is only logged: the caller still has the bytes to serve.
export async function writeAtomically(file: string, body: Buffer, label: string) {
  try {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file + ".tmp", body);
    await fs.rename(file + ".tmp", file);
  } catch (e) {
    console.error(`[${label}] failed to cache ${path.basename(file)}:`, (e as Error).message);
  }
}

// A cached image as a route's response, 404 when there is none. Its URL
// names the exact image (Jellyfin's tag, TMDB's path), so the bytes behind
// it never change. private: browsers may keep it, but no CDN (e.g.
// Cloudflare) serves it to someone who isn't signed in.
export function imageResponse(image: CachedImage | null): Response {
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.body), {
    headers: { "Content-Type": image.type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
