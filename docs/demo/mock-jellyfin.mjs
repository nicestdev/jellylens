// A fake Jellyfin with a demo library of free / public-domain titles, for
// README screenshots. Serves just the endpoints Jellylens calls. Metadata
// and posters come from TMDB (TMDB_API_KEY), episode lists too — minus the
// gaps below, so the Missing page has something to show. How to run it:
// docs/demo/README.md.
import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.MOCK_PORT || 8097);
const KEY = process.env.TMDB_API_KEY;
const tmdb = (p) => fetch(`https://api.themoviedb.org/3${p}${p.includes("?") ? "&" : "?"}api_key=${KEY}`).then((r) => r.json());
const hex = (s) => crypto.createHash("md5").update(s).digest("hex");
const SERVER_ID = hex("demo-server");
const USER = { Id: hex("demo-user"), Name: "Demo", Policy: { IsAdministrator: true, IsDisabled: false } };

// tmdbId, file name (the release-group part is made up)
const MOVIES = [
  [457784, "Agent.327.Operation.Barbershop.2017.1080p.WEB.x264-OpenMovie.mkv"],
  [10378, "Big.Buck.Bunny.2008.1080p.BluRay.x264-OpenMovie.mkv"],
  [406956, "Caminandes.Llamigos.2016.1080p.WEB.x264-OpenMovie.mkv"],
  [717986, "Coffee.Run.2020.1080p.WEB.x264-OpenMovie.mkv"],
  [358332, "Cosmos.Laundromat.2015.1080p.WEB.x264-OpenMovie.mkv"],
  [9761, "Elephants.Dream.2006.1080p.BluRay.x264-OpenMovie.mkv"],
  [420577, "Glass.Half.2015.1080p.WEB.x264-OpenMovie.mkv"],
  [15856, "House.on.Haunted.Hill.1959.1080p.BluRay.x264-Archive.mkv"],
  [10513, "Plan.9.from.Outer.Space.1957.1080p.BluRay.x264-Archive.mkv"],
  [22596, "Safety.Last.1923.1080p.BluRay.x264-Archive.mkv"],
  [45745, "Sintel.2010.1080p.BluRay.x264-OpenMovie.mkv"],
  [133701, "Tears.of.Steel.2012.1080p.BluRay.x264-OpenMovie.mkv"],
  [891761, "Sprite.Fright.2021.1080p.WEB.x264-OpenMovie.mkv"],
  [1062079, "Charge.2022.1080p.WEB.x264-OpenMovie.mkv"],
];

// tmdbId, seasons owned, episodes to leave out { season: [numbers] },
// extra episodes TMDB doesn't know { season: [numbers] } (mismatches).
const SHOWS = [
  [3716, [1, 2, 3, 4, 5, 6, 7], { 5: [12, 13, 14, 15] }, {}], // Dragnet: gap in S5, S8 missing
  [10377, [1, 2, 3], { 2: [14, 15, 16, 17, 18, 19] }, {}], // One Step Beyond
  [33050, [1], {}, { 1: [7] }], // Pioneer One: an episode TMDB doesn't list
  [6560, [1], {}, { 2: [1, 2, 3] }], // Sherlock Holmes: a season TMDB doesn't list
  [18010, [1, 2, 3, 4], {}, {}], // The Cisco Kid: S5 and S6 missing
  [31179, [1, 2, 3, 4, 5], { 2: [20, 21, 22, 23] }, {}], // The Lone Ranger
];

const posters = new Map(); // item id -> TMDB poster path
const items = { Movie: [], Series: [], Episode: [] };

const audio = [{ Type: "Audio", Language: "eng" }];
const video = { Type: "Video", Width: 1920, Height: 1080, Codec: "h264" };

async function build() {
  for (const [id, file] of MOVIES) {
    const m = await tmdb(`/movie/${id}`);
    const itemId = hex("movie" + id);
    posters.set(itemId, m.poster_path);
    items.Movie.push({
      Id: itemId,
      Name: m.title,
      ServerId: SERVER_ID,
      Type: "Movie",
      ProductionYear: Number(m.release_date.slice(0, 4)),
      CommunityRating: Math.round(m.vote_average * 10) / 10,
      ProviderIds: {
        Tmdb: String(id),
        Imdb: m.imdb_id,
        ...(m.belongs_to_collection ? { TmdbCollection: String(m.belongs_to_collection.id) } : {}),
      },
      ImageTags: { Primary: hex("img" + id) },
      Width: 1920,
      Height: 1080,
      RunTimeTicks: (m.runtime || 10) * 60 * 10_000_000,
      Genres: m.genres.map((g) => g.name),
      MediaStreams: [video, ...audio],
      MediaSources: [{ Size: (m.runtime || 10) * 25_000_000, MediaStreams: [video, ...audio] }],
      Path: `/media/movies/${m.title} (${m.release_date.slice(0, 4)})/${file}`,
    });
  }

  for (const [id, seasons, gaps, extra] of SHOWS) {
    const s = await tmdb(`/tv/${id}`);
    const seriesId = hex("show" + id);
    posters.set(seriesId, s.poster_path);
    const episodes = [];
    const add = (season, n) =>
      episodes.push({
        Id: hex(`ep${id}-${season}-${n}`),
        SeriesId: seriesId,
        ParentIndexNumber: season,
        IndexNumber: n,
        IndexNumberEnd: null,
        MediaSources: [{ Size: 400_000_000, MediaStreams: [video, ...audio] }],
      });
    for (const season of seasons) {
      const data = await tmdb(`/tv/${id}/season/${season}`);
      for (const ep of data.episodes ?? []) {
        if (!(gaps[season] ?? []).includes(ep.episode_number)) add(season, ep.episode_number);
      }
    }
    for (const [season, numbers] of Object.entries(extra)) for (const n of numbers) add(Number(season), n);
    items.Episode.push(...episodes);
    items.Series.push({
      Id: seriesId,
      Name: s.name,
      ServerId: SERVER_ID,
      Type: "Series",
      ProductionYear: Number(s.first_air_date.slice(0, 4)),
      CommunityRating: Math.round(s.vote_average * 10) / 10,
      ProviderIds: { Tmdb: String(id) },
      ImageTags: { Primary: hex("img-tv" + id) },
      Status: s.status === "Returning Series" ? "Continuing" : "Ended",
      ChildCount: new Set(episodes.map((e) => e.ParentIndexNumber)).size,
      RecursiveItemCount: episodes.length,
      Genres: s.genres.map((g) => g.name),
    });
  }
  for (const list of Object.values(items)) list.sort((a, b) => (a.Name ?? "").localeCompare(b.Name ?? ""));
  console.log(`[mock] ${items.Movie.length} movies, ${items.Series.length} shows, ${items.Episode.length} episodes`);
}

const json = (res, body, status = 200) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

await build();

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const path = url.pathname;
    if (path === "/Users") return json(res, [USER]);
    if (path === "/System/Configuration") return json(res, { PreferredMetadataLanguage: "en", MetadataCountryCode: "US" });
    if (path === "/Users/AuthenticateByName" && req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const { Username, Pw } = JSON.parse(body || "{}");
      if (Username?.toLowerCase() !== "demo" || Pw !== "demo") return json(res, {}, 401);
      return json(res, { AccessToken: hex("token" + Date.now()), User: USER });
    }
    if (path === "/Sessions/Logout") return json(res, {}, 204);
    if (/^\/Users\/[0-9a-f]+\/Items$/.test(path)) {
      const type = url.searchParams.get("IncludeItemTypes");
      return json(res, { Items: items[type] ?? [], TotalRecordCount: (items[type] ?? []).length });
    }
    const img = path.match(/^\/Items\/([0-9a-f]+)\/Images\/Primary$/);
    if (img && posters.get(img[1])) {
      const r = await fetch(`https://image.tmdb.org/t/p/w500${posters.get(img[1])}`);
      res.writeHead(r.status, { "Content-Type": r.headers.get("content-type") || "image/jpeg" });
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    json(res, { error: "not mocked: " + path }, 404);
  })
  .listen(PORT, () => console.log(`[mock] Jellyfin on http://localhost:${PORT}`));
