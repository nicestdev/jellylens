import { episodeCode, resolutionLabel } from "./format";
import type { StoredFile } from "./store";
import { fold, foldTitle } from "./text";

// What the Analytics page knows about the library's files beyond
// the probe's own fields: the release group from the name, and the video's
// resolution and codec as labels. Worked out once per library scan, for
// media_files (lib/store/files.ts), so a change here shows after the next
// sync.

// Not group tags, though a name can end in them after a dash ("x264-1080p").
const NOT_A_GROUP = /^(\d+p|\d+|[xh]\.?26[45]|hevc|avc|av1|web|dl)$/i;
const AFTER_BRACKET = /\]-([a-z0-9][a-z0-9_]*)$/i;
const AFTER_DASH = /[^-]-([a-z0-9][a-z0-9_]*)$/i;

// Zero-width characters some names carry after the group ("-w00t\u200b").
const INVISIBLE = /[\u200b-\u200d\ufeff]/g;
// A scene short name: all lowercase, the group first, then the show and
// its episode ("pl3x-heman.s01e01-1080p", "tvs-young-sheldon-dl-s06e02").
const SHORT_NAME = /^([a-z0-9]{2,})-(?=.*(?:^|[.-])s\d{1,2}e\d{1,3})/;

// The group in a name, in one of the shapes groups use:
// - after the last dash of a scene-style name
//   ("Heat.1995.German.DL.1080p.BluRay.x264-GRP"), which may have a space
//   in an episode's title ("The.Wire.S02E05.Neue Faelle.alte.Freunde…-GRP");
// - after Sonarr's and Radarr's bracketed quality
//   ("Silo - S01E01 - Freedom Day [WEBDL-1080p][x264]-GRP");
// - first, in a scene short name, unless that's how the show's title
//   starts (title).
// Other names ("Heat (1995) - 1080p", "Spider-Man") have none. Tags some
// sites append ("-GRP[rarbg]", "-GRP (1)") are dropped first.
function groupIn(raw: string, title?: string): string | null {
  const name = raw.replace(INVISIBLE, "");
  const bare = name.replace(/(\s*(\[[^\]]*\]|\([^)]*\)))+$/, "");
  // Without spaces any dot will do; with them, the part after the last one
  // has to look like a release name's tail.
  const tail = bare.split(/\s+/).pop() ?? "";
  const sceneStyle = /\s/.test(bare) ? tail.split(".").length >= 3 : bare.includes(".");
  const short = SHORT_NAME.exec(name)?.[1];
  const candidates = [
    AFTER_BRACKET.exec(name)?.[1],
    sceneStyle ? AFTER_DASH.exec(tail)?.[1] : undefined,
    short &&
    name === name.toLowerCase() &&
    !fold(title ?? "")
      .replace(/ /g, "")
      .startsWith(short)
      ? short
      : undefined,
  ];
  return candidates.find((g): g is string => Boolean(g) && !NOT_A_GROUP.test(g!)) ?? null;
}

// The release group a file is named after, or else its folder: episodes of
// a season pack, and some movies, are named plainly ("s01e01.mkv") inside
// a folder named for the release ("Silo.S01.German.DL.1080p.WEB.h264-GRP").
// title: the movie's or show's, see groupIn.
export function releaseGroupOf(fileName: string, folder?: string, title?: string): string | null {
  return groupIn(fileName.replace(/\.[a-z0-9]{2,4}$/i, ""), title) ?? (folder ? groupIn(folder, title) : null);
}

// ffprobe's video codecs by the names release names use (x265 for any
// H.265, though a WEB-DL's untouched stream wasn't made with x265); others
// as ffprobe spells them, uppercased.
const CODECS: Record<string, string> = {
  hevc: "x265",
  h265: "x265",
  h264: "x264",
  avc: "x264",
  av1: "AV1",
  vp9: "VP9",
  vc1: "VC-1",
  mpeg2video: "MPEG-2",
  mpeg4: "MPEG-4",
};
export const codecLabel = (codec: string | undefined) => (codec ? (CODECS[codec] ?? codec.toUpperCase()) : "");

// One version's file as the scan reads it: its name, its folder's name
// and its path under LIBRARY_DIR, bytes, its video stream's codec
// (lowercased: "hevc", "h264"; "" if none) and size, and its audio
// languages ("DE", "EN"; lib/languages.ts).
export type MediaFile = {
  Name: string;
  Folder?: string;
  Path: string;
  Size: number;
  Codec: string;
  Width?: number;
  Height?: number;
  Languages?: string[];
};

// A movie or an episode with its files. parentId: the movie, or the
// episode's show; title, year and tmdbId: the movie's or the show's. width
// and height: the item's own (its default version's).
export type MediaItem = {
  kind: "movie" | "episode";
  id: string;
  parentId: string;
  title: string;
  year: number | null;
  tmdbId: string | null;
  season?: number | null;
  episode?: number | null;
  episodeEnd?: number | null;
  episodeTitle?: string | null;
  width?: number;
  height?: number;
  files: MediaFile[];
};

// The rows media_files keeps for these items and their files. A group is
// named as first spelled in the library (FuN, FUN are one), so every file
// of it shows the same. Resolution falls back to the item's when the
// file's stream has no size.
export function storedFiles(items: MediaItem[]): StoredFile[] {
  const spelling = new Map<string, string>();
  return items.flatMap((item) =>
    item.files.map((f, idx) => {
      const name = releaseGroupOf(f.Name, f.Folder, item.title);
      const groupKey = name?.toLowerCase() ?? null;
      if (name && groupKey && !spelling.has(groupKey)) spelling.set(groupKey, name);
      const code = episodeCode(item.season, item.episode, item.episodeEnd);
      return {
        kind: item.kind,
        itemId: item.id,
        idx,
        parentId: item.parentId,
        title: item.title,
        year: item.year,
        tmdbId: item.tmdbId,
        season: item.season ?? null,
        episode: item.episode ?? null,
        episodeEnd: item.episodeEnd ?? null,
        episodeTitle: item.episodeTitle ?? null,
        fileName: f.Name,
        path: f.Path,
        size: f.Size,
        group: groupKey ? spelling.get(groupKey)! : null,
        groupKey,
        resolution: resolutionLabel(f.Width, f.Height) || resolutionLabel(item.width, item.height),
        codec: codecLabel(f.Codec),
        languages: f.Languages ?? [],
        search: [foldTitle(item.title), fold(item.episodeTitle ?? ""), fold(code), fold(f.Name)]
          .filter(Boolean)
          .join(" "),
      };
    }),
  );
}
