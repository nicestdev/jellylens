import type { DownloadLibrary } from "./api-types";
import { EPISODE } from "./library-scan";
import { episodeCode } from "./format";
import { seasonFolder } from "./library-names";
import { fromRelease } from "./release-labels";
import { libraryCopies, type DownloadFile, type DownloadPackage, type LibraryCopy } from "./store";

// What the Jellyfin library already has of a download package, by the
// TMDB entry its name was matched to (media_files): for Needs attention's
// tree and Start's Replace or Skip.

// The episodes a name holds ("S01E02", "S01E01E02", "S01E01-E02", "S01E01E02E03"), null
// if it names none.
function episodesIn(name: string): { season: number; episodes: number[] } | null {
  const m = EPISODE.exec(name);
  if (!m) return null;
  const first = Number(m[2]);
  const last = m[3] ? Number(m[3]) : first;
  return {
    season: Number(m[1]),
    episodes: Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i),
  };
}

// What the library already has of a package (by its TMDB entry): which of
// its parts are episodes you own (what Skip leaves out), and the files,
// what comes, and what Start can do about it (DownloadLibrary). null when
// it has nothing of it, a show none of its episodes (or of a pack's season).
export function libraryOf(
  pkg: DownloadPackage,
  files: DownloadFile[],
): { library: DownloadLibrary | null; owned: Set<number> } {
  const owned = new Set<number>();
  if (!pkg.media) return { library: null, owned };
  // Your copies from this very release ("Name - uploader" without the uploader).
  const release = pkg.name.replace(/\s+-\s+[^.]+$/, "").trim();
  // The video's name inside the first archive (archive-peek.ts), without its
  // extension: what the package really holds, which its own name (and the
  // archives') may not say.
  const inner = files[0]?.innerName?.replace(/\.\w{2,4}$/, "") ?? null;
  // proof: the copies the first archive's name proves are from this release
  // (a show's, those of its first episode); else any of them by the package's name.
  const library = (
    old: LibraryCopy[],
    fresh: string[],
    skip: number,
    left: number | null,
    proof: LibraryCopy[] = old,
  ): DownloadLibrary => {
    const proven = proof.filter((c) => fromRelease(c.fileName, inner ?? release));
    const exact = proven.length > 0;
    return {
      old: old.map((c) => c.path).sort(),
      // Nothing comes when Skip would leave nothing.
      new: exact && left === 0 ? [] : fresh,
      exact,
      skip,
      // Another version: Replace. This one: Skip, when something's left
      // (left null: a pack in one archive, which comes whole anyway).
      choices: exact ? (left === 0 ? [] : ["skip"]) : ["replace"],
      disks: [...new Set(old.map((c) => c.path.split("/")[0]))].sort(),
      // Only a show's first archive proves anything about the others.
      presumed:
        inner && proof !== old && exact
          ? old
              .filter((c) => !proven.includes(c))
              .map((c) => c.path)
              .sort()
          : [],
    };
  };
  if (pkg.media.type === "movie") {
    const copies = libraryCopies("movie", pkg.media.tmdbId);
    return { library: copies.length ? library(copies, [inner ?? release], 1, 0) : null, owned };
  }
  const copies = libraryCopies("episode", pkg.media.tmdbId);
  if (!copies.length) return { library: null, owned };
  const has = new Set<string>();
  for (const c of copies) {
    if (c.season === null || c.episode === null) continue;
    for (let e = c.episode; e <= (c.episodeEnd ?? c.episode); e++) has.add(`${c.season}:${e}`);
  }
  // Each part's episodes (a show's archives one per episode, in parts:
  // "….S01E03.….part2.rar", "Car1080S01E03.rar"), and which you have.
  const parts = files.flatMap((f) => {
    const eps = episodesIn(f.name);
    return eps ? [{ file: f, ...eps, mine: eps.episodes.every((e) => has.has(`${eps.season}:${e}`)) }] : [];
  });
  if (!parts.length) {
    // A season pack in one archive (no episodes in its parts' names): what
    // you have of that season.
    const season = /\.S(\d{1,2})\./i.exec(`.${pkg.name}.`)?.[1];
    const mine = season ? copies.filter((c) => c.season === Number(season)) : [];
    if (!mine.length) return { library: null, owned };
    return { library: library(mine, [`${seasonFolder(Number(season))}/${release}`], mine.length, null), owned };
  }
  const seen = new Set<string>();
  for (const p of parts.filter((p) => p.mine)) {
    owned.add(p.file.id);
    for (const e of p.episodes) seen.add(`${p.season}:${e}`);
  }
  if (!owned.size) return { library: null, owned };
  // A copy counts if any episode it covers is one of the owned parts' (a
  // double episode's file covers both).
  const covers = (c: LibraryCopy) => {
    if (c.episode === null) return false;
    for (let e = c.episode; e <= (c.episodeEnd ?? c.episode); e++) if (seen.has(`${c.season}:${e}`)) return true;
    return false;
  };
  // A release that names only the season ("Silo.S01.German.1080p-GRP", one
  // season or a range) gives each episode's file name by putting the
  // episode in its place; else just the episode's code.
  const seasonOnly = /\.S\d{1,2}(?:[+-]S?\d{1,2})*(?=\.)/i;
  const named = seasonOnly.test(release) && !/\.S\d{1,2}E\d/i.test(release);
  const code = (p: (typeof parts)[number]) => {
    const ep = episodeCode(p.season, p.episodes[0], p.episodes.at(-1));
    // The first archive's real name where it's known, the others' worked out.
    if (inner && p === parts[0]) return `${seasonFolder(p.season)}/${inner}`;
    return `${seasonFolder(p.season)}/${named ? release.replace(seasonOnly, `.${ep}`) : ep}`;
  };
  const missing = parts.filter((p) => !p.mine);
  // The first part's episodes tell which release the library has (its
  // archive's real name), the rest of its copies are taken to be the same.
  const firstEpisodes = parts[0].episodes.map((e) => `${parts[0].season}:${e}`);
  const ofFirst = (c: LibraryCopy) =>
    c.episode !== null &&
    Array.from({ length: (c.episodeEnd ?? c.episode) - c.episode + 1 }, (_, i) => `${c.season}:${c.episode! + i}`).some(
      (k) => firstEpisodes.includes(k),
    );
  const old = copies.filter(covers);
  const lib = library(old, [], seen.size, missing.length, inner ? old.filter(ofFirst) : old);
  // What comes: every episode with Replace, only the missing with Skip.
  lib.new = [...new Set((lib.exact ? missing : parts).map(code))].sort();
  return { library: lib, owned };
}
