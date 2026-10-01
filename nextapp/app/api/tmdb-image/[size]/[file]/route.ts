import { getTmdbImage, isTmdbImageFile, isTmdbSize } from "@/lib/tmdb-image-cache";
import { imageResponse } from "@/lib/file-cache";

// GET /api/tmdb-image/<size>/<file> — a TMDB poster, proxied and cached
// (see lib/tmdb-image-cache.ts). Build URLs with tmdbImage() in lib/api-client.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ size: string; file: string }> }) {
  const { size, file } = await params;
  if (!isTmdbSize(size) || !isTmdbImageFile(file)) return new Response("Bad image request", { status: 400 });
  return imageResponse(await getTmdbImage(size, file));
}
