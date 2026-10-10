import { describe, expect, it } from "vitest";
import {
  addIgnored,
  addRequester,
  adoptLocalRequests,
  collectionIds,
  createRequest,
  getEpisodes,
  getMovies,
  getPreferences,
  libraryCounts,
  libraryEntries,
  listIgnored,
  listRequests,
  matchedShows,
  removeIgnored,
  removeRequest,
  removeRequester,
  replaceLibrary,
  replaceTmdb,
  requestExists,
  setPreferences,
  syncedAt,
  tmdbPosterPaths,
  type IgnoreEntry,
} from ".";
import { LOCAL_USER } from "../session";
import { movie, show } from "@/test/fixtures";

describe("library", () => {
  const library = {
    movies: [
      movie({
        Id: "m2",
        Name: "Zulu",
        ProviderIds: { Tmdb: "2" },
        FileName: "Zulu-GRP.mkv",
        PosterPath: "/zulu.jpg",
      }),
      movie({ Id: "m1", Name: "Alien", ProviderIds: { Tmdb: "1", TmdbCollection: "c1" } }),
      movie({ Id: "m3", Name: "Unmatched" }),
    ],
    shows: [show({ Id: "s1", Name: "Silo", ProviderIds: { Tmdb: "10" } })],
    episodes: [
      {
        Id: "e1",
        SeriesId: "s1",
        ParentIndexNumber: 1,
        IndexNumber: 1,
        IndexNumberEnd: null,
        Size: 5,
        AudioLanguages: ["DE"],
      },
    ],
  };

  it("keeps the scan's order and every field", () => {
    replaceLibrary(library, "2026-06-15T00:00:00Z");
    expect(getMovies().map((m) => m.Id)).toEqual(["m2", "m1", "m3"]);
    expect(getMovies()[0]).toEqual(library.movies[0]);
    expect(getEpisodes()).toEqual(library.episodes);
    expect(syncedAt("library")).toBe("2026-06-15T00:00:00Z");
  });

  it("replaces the whole library on every sync", () => {
    replaceLibrary(library, "2026-06-15T00:00:00Z");
    replaceLibrary({ movies: [library.movies[1]], shows: [], episodes: [] }, "2026-06-16T00:00:00Z");
    expect(libraryCounts()).toEqual({ movies: 1, shows: 0, episodes: 0 });
    expect(syncedAt("library")).toBe("2026-06-16T00:00:00Z");
  });

  it("answers the lookups other parts need", () => {
    replaceLibrary(library, "2026-06-15T00:00:00Z");
    expect(libraryEntries()).toEqual(
      expect.arrayContaining([
        { mediaType: "movie", id: "m2", tmdbId: "2", posterPath: "/zulu.jpg", fileName: "Zulu-GRP.mkv" },
        { mediaType: "movie", id: "m1", tmdbId: "1", posterPath: null, fileName: undefined },
        { mediaType: "tv", id: "s1", tmdbId: "10", posterPath: null, fileName: undefined },
      ]),
    );
    expect(libraryEntries()).toHaveLength(3); // m3 isn't matched to TMDB
    expect(collectionIds()).toEqual(["c1"]);
    expect(matchedShows()).toEqual([{ id: "s1", tmdbId: "10" }]);
  });
});

describe("ignored rows", () => {
  const show: IgnoreEntry = { kind: "missing", seriesId: "s1", season: 2 };
  const wholeShow: IgnoreEntry = { kind: "missing", seriesId: "s1", season: null };
  const part: IgnoreEntry = { kind: "collection", collectionId: "c1", movieId: 5 };

  it("adds each entry once and removes exactly that one", () => {
    addIgnored(show);
    addIgnored(show);
    addIgnored(wholeShow);
    addIgnored(part);
    expect(listIgnored()).toEqual([show, wholeShow, part]);

    removeIgnored(wholeShow);
    expect(listIgnored()).toEqual([show, part]);
  });

  it("keeps kinds apart", () => {
    addIgnored({ kind: "mismatch", seriesId: "s1", season: 2 });
    removeIgnored(show);
    expect(listIgnored()).toEqual([{ kind: "mismatch", seriesId: "s1", season: 2 }]);
  });
});

describe("requests", () => {
  const heat = {
    mediaType: "movie" as const,
    tmdbId: 949,
    title: "Heat",
    year: 1995,
    releaseDate: "1995-12-15",
    posterPath: "/h.jpg",
    requestedAt: "2026-06-01T00:00:00Z",
  };
  const bob = { id: "u1", name: "Bob", requestedAt: "2026-06-01T00:00:00Z" };
  const ana = { id: "u2", name: "Ana", requestedAt: "2026-06-02T00:00:00Z" };

  it("keeps one entry per title with everyone who asked", () => {
    createRequest(heat, [bob]);
    addRequester("movie", 949, ana);
    addRequester("movie", 949, ana);
    expect(listRequests()).toEqual([{ ...heat, requesters: [bob, ana] }]);
    expect(requestExists("movie", 949)).toBe(true);
    expect(requestExists("tv", 949)).toBe(false);
  });

  it("goes with its last requester", () => {
    createRequest(heat, [bob, ana]);
    removeRequester("movie", 949, "u1");
    expect(listRequests()[0].requesters).toEqual([ana]);
    removeRequester("movie", 949, "u2");
    expect(listRequests()).toEqual([]);
  });

  it("can be removed for everyone at once", () => {
    createRequest(heat, [bob, ana]);
    removeRequest("movie", 949);
    expect(listRequests()).toEqual([]);
  });

  it("hands the local user's requests to the first admin", () => {
    const local = { id: LOCAL_USER.id, name: LOCAL_USER.name, requestedAt: "2026-05-01T00:00:00Z" };
    createRequest(heat, [local, bob]);
    createRequest({ ...heat, tmdbId: 1, title: "Alien" }, [local]);

    adoptLocalRequests({ id: "u1", name: "Bob", admin: true });

    const [first, second] = listRequests();
    // Bob asked for Heat himself: his own request stays, the local one goes.
    expect(first.requesters).toEqual([bob]);
    expect(second.requesters).toEqual([{ ...local, id: "u1", name: "Bob" }]);
  });
});

describe("preferences", () => {
  it("defaults, and keeps what's set", () => {
    expect(getPreferences()).toEqual({ showSdReleases: false });
    setPreferences({ showSdReleases: true });
    expect(getPreferences()).toEqual({ showSdReleases: true });
  });

  it("leaves out an option that's gone but still stored", () => {
    // showFileNames was one, until the Missing page stopped listing files.
    setPreferences({ showFileNames: true } as never);
    expect(getPreferences()).toEqual({ showSdReleases: false });
  });
});

describe("tmdbPosterPaths", () => {
  it("collects every poster something stored shows", () => {
    createRequest(
      {
        mediaType: "movie",
        tmdbId: 1,
        title: "A",
        year: null,
        releaseDate: null,
        posterPath: "/request.jpg",
        requestedAt: "x",
      },
      [],
    );
    replaceTmdb(
      {},
      {
        c: {
          name: "C",
          posterPath: "/collection.jpg",
          parts: [{ tmdbId: 2, title: "P", releaseDate: null, posterPath: "/part.jpg" }],
        },
      },
      null,
    );
    expect(tmdbPosterPaths()).toEqual(new Set(["/request.jpg", "/collection.jpg", "/part.jpg"]));
  });
});
