import type { MoviesResponse } from "@/lib/api-types";
import { getMovies } from "@/lib/store";

// The library's movies for the Movies page, without their file names: those
// are for admins only (the Missing page, when turned on in Settings).
export async function GET() {
  const items = getMovies().map(({ FileName: _fileName, ...movie }) => movie);
  return Response.json({ Items: items } satisfies MoviesResponse);
}
