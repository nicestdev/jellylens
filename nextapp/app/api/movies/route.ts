import { store } from "@/lib/store";
import { audioLanguages } from "@/lib/languages";

// Only what the Movies page shows. The cached Jellyfin items carry far more —
// full MediaStreams alone are ~4 KB per movie — so passing them through made
// this response ~2.4 MB.
export async function GET() {
  const items = store.jellyfin.movies.map((m) => ({
    Id: m.Id,
    Name: m.Name,
    ServerId: m.ServerId,
    ProductionYear: m.ProductionYear,
    ProviderIds: { Tmdb: m.ProviderIds?.Tmdb },
    ImageTags: { Primary: (m.ImageTags as { Primary?: string } | undefined)?.Primary },
    Width: m.Width,
    Height: m.Height,
    RunTimeTicks: m.RunTimeTicks,
    Genres: m.Genres,
    AudioLanguages: audioLanguages(m.MediaStreams as { Type?: string; Language?: string }[] | undefined),
  }));
  return Response.json({ Items: items });
}
