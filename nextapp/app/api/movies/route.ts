import type { MoviesResponse } from "@/lib/api-types";
import { getMovies, movieCodecs } from "@/lib/store";

// The library's movies for the Movies page, with their file's video codec
// but without their file names: those are for admins only (the Missing
// page, when turned on in Settings, and Analytics).
export async function GET() {
  const codecs = movieCodecs();
  const items = getMovies().map(({ FileName: _fileName, ...movie }) => ({
    ...movie,
    Codec: codecs.get(movie.Id) ?? "",
  }));
  return Response.json({ Items: items } satisfies MoviesResponse);
}
