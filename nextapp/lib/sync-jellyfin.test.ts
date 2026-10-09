import { describe, expect, it } from "vitest";
import {
  fileNameOf,
  folderOf,
  mediaFilesOf,
  mediaItems,
  syncJellyfin,
  toEpisode,
  toMovie,
  toShow,
} from "./sync-jellyfin";
import { fileSummary, getEpisodes, getMovies, getShows, queryFiles, syncedAt } from "./store";
import { json, mockFetch } from "@/test/http";

describe("folderOf", () => {
  it("names the folder a file is in, whichever the separator", () => {
    expect(folderOf("/tv/Silo/Silo.S01.1080p-GRP/s01e01.mkv")).toBe("Silo.S01.1080p-GRP");
    expect(folderOf("D:\\TV\\Silo\\Season 1\\s01e01.mkv")).toBe("Season 1");
    expect(folderOf("s01e01.mkv")).toBeUndefined();
    expect(folderOf(undefined)).toBeUndefined();
  });
});

describe("mediaItems", () => {
  it("gives an episode its show's title, year and TMDB id, and its numbers", () => {
    const [item] = mediaItems(
      [],
      [{ Id: "s1", Name: "Silo", ProductionYear: 2023, ProviderIds: { Tmdb: "125988" } }],
      [
        {
          Id: "e1",
          Name: "Holston",
          SeriesId: "s1",
          ParentIndexNumber: 1,
          IndexNumber: 2,
          MediaSources: [{ Path: "/tv/s01e02.mkv", Size: 3 }],
        },
      ],
    );
    expect(item).toMatchObject({
      kind: "episode",
      id: "e1",
      parentId: "s1",
      title: "Silo",
      year: 2023,
      tmdbId: "125988",
      season: 1,
      episode: 2,
      episodeEnd: null,
      episodeTitle: "Holston",
      files: [{ Name: "s01e02.mkv", Folder: "tv", Size: 3 }],
    });
  });
});

describe("fileNameOf", () => {
  it("keeps just the file's name, whatever the separator", () => {
    expect(fileNameOf("/media/movies/Heat (1995)/Heat.1995.1080p-GRP.mkv")).toBe("Heat.1995.1080p-GRP.mkv");
    expect(fileNameOf("D:\\Movies\\Heat.mkv")).toBe("Heat.mkv");
    expect(fileNameOf(undefined)).toBeUndefined();
    expect(fileNameOf("")).toBeUndefined();
  });
});

describe("toMovie and toShow", () => {
  it("keep only what Jellylens reads: the file's name, not its path, and the audio languages", () => {
    const raw = {
      Id: "m1",
      Name: "Heat",
      Path: "/media/Heat.mkv",
      ProviderIds: { Tmdb: "949", Imdb: "tt0113277" },
      ImageTags: { Primary: "tag", Thumb: "x" },
      MediaStreams: [{ Type: "Video" }, { Type: "Audio", Language: "ger" }, { Type: "Audio", Language: "eng" }],
      UserData: { Played: true },
    };
    expect(toMovie(raw)).toEqual({
      Id: "m1",
      Name: "Heat",
      ServerId: undefined,
      ProductionYear: undefined,
      ProviderIds: { Tmdb: "949", TmdbCollection: undefined },
      ImageTags: { Primary: "tag" },
      Genres: [],
      Width: undefined,
      Height: undefined,
      RunTimeTicks: undefined,
      FileName: "Heat.mkv",
      AudioLanguages: ["DE", "EN"],
    });
  });

  it("keeps each version's file and folder name, size, video codec and dimensions, and audio languages", () => {
    const raw = {
      Id: "m1",
      Name: "Heat",
      Path: "/media/Heat.1995.1080p-GRP.mkv",
      MediaSources: [
        {
          Path: "/media/Heat.1995.1080p-GRP.mkv",
          Size: 99,
          MediaStreams: [
            { Type: "Audio", Codec: "ac3", Language: "ger" },
            { Type: "Audio", Codec: "ac3", Language: "eng" },
            { Type: "Video", Codec: "HEVC", Width: 1920, Height: 800 },
          ],
        },
        { Path: "Heat.2160p-FuN.mkv" },
      ],
    };
    expect(mediaFilesOf(raw)).toEqual([
      {
        Name: "Heat.1995.1080p-GRP.mkv",
        Folder: "media",
        Size: 99,
        Codec: "hevc",
        Width: 1920,
        Height: 800,
        Languages: ["DE", "EN"],
      },
      {
        Name: "Heat.2160p-FuN.mkv",
        Folder: undefined,
        Size: 0,
        Codec: "",
        Width: undefined,
        Height: undefined,
        Languages: [],
      },
    ]);
  });

  it("keeps a show's season and episode counts and status", () => {
    expect(
      toShow({
        Id: "s1",
        Name: "Silo",
        Status: "Continuing",
        ChildCount: 2,
        RecursiveItemCount: 20,
        Genres: ["Drama"],
      }),
    ).toMatchObject({
      Id: "s1",
      Status: "Continuing",
      ChildCount: 2,
      RecursiveItemCount: 20,
      Genres: ["Drama"],
    });
  });
});

describe("toEpisode", () => {
  it("keeps the numbering, size and audio languages", () => {
    expect(
      toEpisode({
        Id: "e1",
        Name: "Pilot",
        SeriesId: "s1",
        ParentIndexNumber: 2,
        IndexNumber: 1,
        IndexNumberEnd: 2,
        MediaSources: [{ Size: 99, MediaStreams: [{ Type: "Audio", Language: "ger" }] }],
      }),
    ).toEqual({
      Id: "e1",
      SeriesId: "s1",
      ParentIndexNumber: 2,
      IndexNumber: 1,
      IndexNumberEnd: 2,
      Size: 99,
      AudioLanguages: ["DE"],
    });
  });

  it("fills in what Jellyfin leaves out", () => {
    expect(toEpisode({ Id: "e1", Name: "?", SeriesId: "s1" })).toMatchObject({
      ParentIndexNumber: null,
      IndexNumber: null,
      IndexNumberEnd: null,
      Size: 0,
      AudioLanguages: [],
    });
  });
});

describe("syncJellyfin", () => {
  it("replaces the stored library with what Jellyfin lists", async () => {
    const fetch = mockFetch((url) => {
      if (url.pathname !== "/Users/admin/Items") return;
      const type = url.searchParams.get("IncludeItemTypes");
      if (type === "Movie") {
        return json({
          Items: [
            {
              Id: "m1",
              Name: "Heat",
              Path: "/x/Heat.mkv",
              MediaSources: [
                {
                  Path: "/x/Heat.1995.1080p-GRP.mkv",
                  Size: 5,
                  MediaStreams: [
                    { Type: "Audio", Language: "ger" },
                    { Type: "Audio", Language: "eng" },
                  ],
                },
              ],
            },
          ],
        });
      }
      if (type === "Series") return json({ Items: [{ Id: "s1", Name: "Silo" }] });
      if (type === "Episode")
        return json({ Items: [{ Id: "e1", Name: "E1", SeriesId: "s1", ParentIndexNumber: 1, IndexNumber: 1 }] });
    });

    const result = await syncJellyfin({ jellyfinUrl: "http://jf", jellyfinApiKey: "key", jellyfinUserId: "admin" });

    expect(result).toMatchObject({ movies: 1, shows: 1, episodes: 1 });
    expect(getMovies()).toMatchObject([{ Id: "m1", Name: "Heat", FileName: "Heat.mkv", AudioLanguages: [] }]);
    expect(getShows().map((s) => s.Id)).toEqual(["s1"]);
    expect(getEpisodes().map((e) => e.Id)).toEqual(["e1"]);
    // The library's files, for Analytics.
    expect(fileSummary("movies")).toMatchObject({ files: 1, size: 5 });
    expect(
      queryFiles("movies", { words: [], groups: [], resolutions: [], codecs: [], languages: [] }, "title", true, 0, 1)
        .items,
    ).toMatchObject([{ title: "Heat", fileName: "Heat.1995.1080p-GRP.mkv", group: "GRP", languages: ["DE", "EN"] }]);
    expect(syncedAt("jellyfin")).toBe(result.syncedAt);
    // Authenticated with the API key.
    expect(fetch.mock.calls[0][1]).toMatchObject({ headers: { "X-Emby-Token": "key" } });
  });

  it("keeps the old library when Jellyfin fails", async () => {
    mockFetch(() => new Response("down", { status: 500 }));
    await expect(
      syncJellyfin({ jellyfinUrl: "http://jf", jellyfinApiKey: "key", jellyfinUserId: "admin" }),
    ).rejects.toThrow(/HTTP 500/);
    expect(syncedAt("jellyfin")).toBeNull();
  });
});
