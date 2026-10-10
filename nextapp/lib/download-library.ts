import type { DownloadLibrary } from "./api-types";
import { copyLabel, fromRelease } from "./release-labels";
import { libraryCopies, type DownloadFile, type DownloadPackage, type LibraryCopy } from "./store";

// What the Jellyfin library already has of a download package, by the
// TMDB entry its name was matched to (media_files): for the Downloads
// page's badge and part tiles, and Start's "only the missing ones".

// The episodes a name holds ("S01E02", "S01E01E02", "S01E01-E02"), null
// if it names none.
function episodesIn(name: string): { season: number; episodes: number[] } | null {
  const m = /S(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))?/i.exec(name);
  if (!m) return null;
  const first = Number(m[2]);
  const last = m[3] ? Number(m[3]) : first;
  return {
    season: Number(m[1]),
    episodes: Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i),
  };
}

// What the library already has of a package (by its TMDB entry): which of
// its parts are episodes you own, and what your copies are.
export function libraryOf(
  pkg: DownloadPackage,
  files: DownloadFile[],
): { library: DownloadLibrary | null; owned: Set<number> } {
  const owned = new Set<number>();
  if (!pkg.media) return { library: null, owned };
  // Your copies from this very release ("Name - uploader" without the uploader).
  const release = pkg.name.replace(/\s+-\s+[^.]+$/, "").trim();
  const exact = (list: LibraryCopy[]) => list.filter((c) => fromRelease(c.fileName, release)).length;
  if (pkg.media.type === "movie") {
    const copies = libraryCopies("movie", pkg.media.tmdbId);
    return {
      library: copies.length
        ? {
            have: [...new Set(copies.map(copyLabel))],
            exact: exact(copies),
            parts: 0,
            partsOwned: 0,
            season: null,
          }
        : null,
      owned,
    };
  }
  const copies = libraryCopies("episode", pkg.media.tmdbId);
  if (!copies.length) return { library: null, owned };
  const has = new Set<string>();
  for (const c of copies) {
    if (c.season === null || c.episode === null) continue;
    for (let e = c.episode; e <= (c.episodeEnd ?? c.episode); e++) has.add(`${c.season}:${e}`);
  }
  let parts = 0;
  const seen = new Set<string>();
  for (const f of files) {
    const eps = episodesIn(f.name);
    if (!eps) continue;
    parts++;
    if (eps.episodes.every((e) => has.has(`${eps.season}:${e}`))) {
      owned.add(f.id);
      for (const e of eps.episodes) seen.add(`${eps.season}:${e}`);
    }
  }
  // A season pack (no episodes in its parts' names): how many of that
  // season's episodes you have.
  const packSeason = parts ? null : /\.S(\d{1,2})\./i.exec(`.${pkg.name}.`)?.[1];
  const seasonCopies = packSeason ? copies.filter((c) => c.season === Number(packSeason)) : [];
  // A copy counts if any episode it covers is one of the owned parts' (a
  // double episode's file covers both).
  const covers = (c: LibraryCopy) => {
    if (c.episode === null) return false;
    for (let e = c.episode; e <= (c.episodeEnd ?? c.episode); e++) if (seen.has(`${c.season}:${e}`)) return true;
    return false;
  };
  const relevant = parts ? copies.filter(covers) : seasonCopies;
  if (!owned.size && !seasonCopies.length) return { library: null, owned };
  return {
    library: {
      have: [...new Set(relevant.map(copyLabel))],
      exact: exact(relevant),
      parts,
      partsOwned: owned.size,
      season: packSeason ? { number: Number(packSeason), episodes: seasonCopies.length } : null,
    },
    owned,
  };
}
