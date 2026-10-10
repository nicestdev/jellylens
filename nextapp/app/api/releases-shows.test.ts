import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { episode, movie, show } from "@/test/fixtures";
import { addGroup, insertReleases, replaceLibrary, replaceMissing, saveTitleMatch } from "@/lib/store";

// GET /api/releases (the Releases page's tiles) and GET /api/shows.

const release = (id: string, titleKey: string, name: string, publishedAt: number, quality = "HD-1080p") => ({
  id,
  titleKey,
  name,
  link: "",
  type: "movie",
  quality,
  publishedAt,
});
const entry = (tmdbId: number, title: string, year: number) => ({
  mediaType: "movie" as const,
  tmdbId,
  title,
  originalTitle: title,
  year,
  posterPath: null,
});

// Three tiles: Alpha (matched, owned), Charlie (matched) and an unchecked
// title whose year comes from its release name.
function seed() {
  addGroup("g1", "GRPA");
  addGroup("g2", "GRPB");
  insertReleases("g1", [
    release("1", "alpha", "Alpha.2001.German.1080p.BluRay.x264-GRPA", 300),
    release("2", "charlie", "Charlie.2003.German.2160p.WEB.h265-GRPA", 100, "UHD-2160p"),
  ]);
  insertReleases("g2", [release("3", "bravo", "Bravo.2002.German.1080p.WEB.x264-GRPB", 200)]);
  saveTitleMatch("alpha", "verified", entry(1, "Alpha", 2001), { title: "Alpha", year: 2001 });
  saveTitleMatch("charlie", "verified", entry(3, "Charlie", 2003), { title: "Charlie", year: 2003 });
  replaceLibrary(
    {
      movies: [movie({ Id: "m1", Name: "Alpha", ProviderIds: { Tmdb: "1" }, PosterPath: "/alpha.jpg" })],
      shows: [],
      episodes: [],
    },
    "2026-10-01T00:00:00.000Z",
  );
}

const releases = async (query = "") => {
  const { GET } = await import("./releases/route");
  return (await GET(new NextRequest("http://jellylens.test/api/releases?" + query))).json();
};
const keys = (body: { Items: { key: string }[] }) => body.Items.map((t) => t.key);

describe("GET /api/releases", () => {
  it("sorts newest first by default, title A to Z when sorted by title", async () => {
    seed();
    expect(keys(await releases())).toEqual(["movie:1", "bravo", "movie:3"]);
    expect(keys(await releases("dir=asc"))).toEqual(["movie:3", "bravo", "movie:1"]);
    expect(keys(await releases("sort=title"))).toEqual(["movie:1", "bravo", "movie:3"]);
    expect(keys(await releases("sort=title&dir=desc"))).toEqual(["movie:3", "bravo", "movie:1"]);
    // An unknown sort is by date.
    expect(keys(await releases("sort=size"))).toEqual(["movie:1", "bravo", "movie:3"]);
  });

  it("pages from an offset, a bad one starting at the top", async () => {
    seed();
    expect(keys(await releases("offset=1"))).toEqual(["bravo", "movie:3"]);
    expect(keys(await releases("offset=-5"))).toEqual(["movie:1", "bravo", "movie:3"]);
    expect(keys(await releases("offset=abc"))).toEqual(["movie:1", "bravo", "movie:3"]);
    // Past the end: no tiles, but still the count.
    expect(await releases("offset=10")).toMatchObject({ Items: [], matched: 3, total: 3 });
  });

  it("counts every tile in total, the matching ones in matched", async () => {
    seed();
    expect(await releases()).toMatchObject({ total: 3, matched: 3 });
    expect(await releases("q=bravo")).toMatchObject({ total: 3, matched: 1, Items: [{ key: "bravo" }] });
    expect(await releases("group=GRPA")).toMatchObject({ total: 3, matched: 2 });
    expect(await releases("quality=UHD-2160p&quality=HD-1080p&group=GRPB")).toMatchObject({ total: 3, matched: 1 });
    expect(await releases("q=nothing")).toMatchObject({ total: 3, matched: 0, Items: [] });
  });

  it("gives an unchecked title its release name's year, an owned one the library's poster", async () => {
    seed();
    const body = await releases();
    const byKey = new Map(body.Items.map((t: { key: string }) => [t.key, t]));
    expect(byKey.get("bravo")).toMatchObject({ year: 2002, library: null });
    expect(byKey.get("movie:1")).toMatchObject({ year: 2001, library: { id: "m1", posterPath: "/alpha.jpg" } });
    expect(byKey.get("movie:3")).toMatchObject({ library: null });
    expect(body).toMatchObject({
      facets: { group: ["GRPA", "GRPB"], quality: ["HD-1080p", "UHD-2160p"] },
      syncing: false,
    });
  });
});

describe("GET /api/shows", () => {
  const shows = async () => {
    const { GET } = await import("./shows/route");
    return (await (await GET()).json()).Items;
  };

  it("counts each audio language's episodes, overall and per season", async () => {
    const lang = (ep: ReturnType<typeof episode>, AudioLanguages: string[]) => ({ ...ep, AudioLanguages });
    replaceLibrary(
      {
        movies: [],
        shows: [show({ Id: "s1", Name: "Show One" }), show({ Id: "s2", Name: "Show Two" })],
        episodes: [
          lang(episode("s1", 2, 1), ["ger", "eng"]),
          lang(episode("s1", 1, 1), ["ger"]),
          lang(episode("s1", 1, 2), ["eng"]),
          // No season number counts as season 0; no show, as none.
          lang({ ...episode("s1", 0, 1), Id: "no-season", ParentIndexNumber: null }, []),
          lang(episode("", 1, 1), ["ger"]),
        ],
      },
      "2026-10-01T00:00:00.000Z",
    );
    const [one, two] = await shows();
    expect(one.Languages).toEqual({
      total: 4,
      byLang: { ger: 2, eng: 2 },
      seasons: [
        { season: 0, total: 1, byLang: {} },
        { season: 1, total: 2, byLang: { ger: 1, eng: 1 } },
        { season: 2, total: 1, byLang: { ger: 1, eng: 1 } },
      ],
    });
    expect(two).toMatchObject({ Id: "s2", Languages: null, MissingEpisodes: null, Mismatches: null });
  });

  it("adds what the missing recheck found", async () => {
    replaceLibrary(
      { movies: [], shows: [show({ Id: "s1" }), show({ Id: "s2" })], episodes: [episode("s1", 1, 1)] },
      "2026-10-01T00:00:00.000Z",
    );
    const missing = { count: 1, seasons: [] };
    const mismatch = { extraSeasons: [9], extraEpisodes: [] };
    replaceMissing({ s1: missing }, {}, { s2: mismatch }, "2026-10-01T00:00:00.000Z");
    const [one, two] = await shows();
    expect(one).toMatchObject({ MissingEpisodes: missing, Mismatches: null, Languages: { total: 1, byLang: {} } });
    expect(two).toMatchObject({ MissingEpisodes: null, Mismatches: mismatch, Languages: null });
  });
});
