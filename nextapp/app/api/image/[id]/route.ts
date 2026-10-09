import type { NextRequest } from "next/server";
import { getImage } from "@/lib/image-cache";
import { imageResponse } from "@/lib/file-cache";

// GET /api/image/<itemId>?tag=<imageTag>&h=<height> — a Jellyfin item's
// primary image, proxied and cached (see lib/image-cache.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tag = req.nextUrl.searchParams.get("tag") ?? "";
  // Snap to 40px steps so callers can't fill the disk with one-off sizes.
  // No height (or none that's a number) is the default, 240.
  const asked = Number(req.nextUrl.searchParams.get("h") || NaN);
  const h = Number.isNaN(asked) ? 240 : Math.min(1200, Math.max(40, Math.round(asked / 40) * 40));
  if (!/^[0-9a-f]{32}$/i.test(id) || !/^[0-9a-z]{1,64}$/i.test(tag)) {
    return new Response("Bad image request", { status: 400 });
  }
  return imageResponse(await getImage(id, tag, h));
}
