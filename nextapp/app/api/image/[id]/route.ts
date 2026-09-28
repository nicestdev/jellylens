import type { NextRequest } from "next/server";
import { getImage } from "@/lib/image-cache";

// GET /api/image/<itemId>?tag=<imageTag>&h=<height> — a Jellyfin item's
// primary image, proxied and cached (see lib/image-cache.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  // Snap to 40px steps so callers can't fill the disk with one-off sizes.
  const h = Math.min(1200, Math.max(40, Math.round(Number(req.nextUrl.searchParams.get("h")) / 40) * 40 || 240));
  if (!/^[0-9a-f]{32}$/i.test(id) || !/^[0-9a-z]{1,64}$/i.test(tag)) {
    return new Response("Bad image request", { status: 400 });
  }

  const image = await getImage(id, tag, h);
  if (!image) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(image.body), {
    headers: {
      "Content-Type": image.type,
      // The tag is in the URL, so a given URL's bytes never change. private:
      // browsers may keep them, but no CDN (e.g. Cloudflare) serves them to
      // someone who isn't signed in.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
