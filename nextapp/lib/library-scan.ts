import fs from "fs/promises";
import path from "path";
import { LIBRARY_DIR } from "./env";
import { ffprobe, type Probe } from "./ffprobe";
import { fetchTmdbDetails, type TmdbDetails } from "./tmdb";
import { storedFiles, type MediaFile, type MediaItem } from "./analytics";
import { mapWithConcurrency } from "./async";
import {
  getDetails,
  getMovies,
  getProbes,
  getShows,
  pruneProbes,
  replaceLibrary,
  setDetails,
  setProbe,
  updateTitles,
  type LibraryEpisode,
  type LibraryMovie,
  type LibraryShow,
} from "./store";

// The library as it is on disk: LIBRARY_DIR's disks, each with movies/ and
// shows/, a folder per title named "Name (Year) [tmdbid-N]" (as Organize names
// them, lib/library-names.ts) and a show's episodes in it named SxxEyy. A
// title on several disks is one title. Every video is probed with ffprobe
// (lib/ffprobe.ts), once: a probe is kept until the file's size or mtime
// changes. TMDB gives what the files don't (name, genres, poster, a movie's
// collection, a show's status), asked once per title here and refreshed
// by the TMDB sync (refreshDetails).

const VIDEO = /\.(mkv|mp4|m4v|avi|ts|m2ts|wmv|mov)$/i;
// Jellyfin's extras: not the title itself, in a folder of their own or
// named with a suffix.
const EXTRA_DIRS =
  /^(extras|featurettes|behind the scenes|deleted scenes|interviews|scenes|shorts|trailers|samples?|other|clips)$/i;
const EXTRA_FILE = /(^|[-._ ])(trailer|sample|featurette|behindthescenes|deleted|interview|scene|short|clip|other)s?$/i;
const TITLE_FOLDER = /^(.*?)(?: \((\d{4})\))? \[tmdbid-(\d+)\]$/;
export const EPISODE = /S(\d{1,3})E(\d{1,4})(?:-?E(\d{1,4}))?/i;

const PROBES_AT_ONCE = 4;
const TMDB_AT_ONCE = 5;

type Kind = "movie" | "tv";
// A video file. rel: under LIBRARY_DIR.
type ScanFile = { rel: string; name: string; folder: string; disk: string; size: number; mtime: number };
type TitleFolder = { kind: Kind; tmdbId: string; name: string; year: number | null; disk: string; files: ScanFile[] };

// How far a scan is, for the Organize page: listing the disks, then probing
// new files (done of total), then asking TMDB about new titles.
export type ScanProgress = { phase: "listing" | "probing" | "tmdb" | "saving"; done: number; total: number };
const g = globalThis as unknown as { __jellylensScanProgress?: ScanProgress | null };
export const scanProgress = () => g.__jellylensScanProgress ?? null;
const progress = (p: ScanProgress | null) => {
  g.__jellylensScanProgress = p;
};

const readDir = (dir: string) => fs.readdir(dir, { withFileTypes: true }).catch(() => []);

// Every video under dir, extras and samples left out.
export async function videosIn(dir: string, disk: string): Promise<ScanFile[]> {
  const entries = await readDir(dir);
  const nested = await Promise.all(
    entries.map(async (e): Promise<ScanFile[]> => {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) return EXTRA_DIRS.test(e.name) ? [] : videosIn(abs, disk);
      if (!e.isFile() || !VIDEO.test(e.name) || EXTRA_FILE.test(e.name.replace(VIDEO, ""))) return [];
      const stat = await fs.stat(abs).catch(() => null);
      if (!stat) return [];
      return [
        {
          rel: path.relative(LIBRARY_DIR, abs),
          name: e.name,
          folder: path.basename(dir),
          disk,
          size: stat.size,
          mtime: Math.floor(stat.mtimeMs),
        },
      ];
    }),
  );
  return nested.flat();
}

// The title folders of every disk; untagged: folders without a
// "[tmdbid-N]", which the library can't place.
async function listTitles(): Promise<{ titles: TitleFolder[]; untagged: string[] }> {
  const titles: TitleFolder[] = [];
  const untagged: string[] = [];
  const disks = (await readDir(LIBRARY_DIR)).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const disk of disks.sort()) {
    for (const [sub, kind] of [
      ["movies", "movie"],
      ["shows", "tv"],
    ] as const) {
      const dir = path.join(LIBRARY_DIR, disk, sub);
      const folders = (await readDir(dir)).filter((d) => d.isDirectory());
      await mapWithConcurrency(folders, 8, async (f) => {
        const m = TITLE_FOLDER.exec(f.name);
        if (!m) {
          untagged.push(path.join(disk, sub, f.name));
          return;
        }
        const files = await videosIn(path.join(dir, f.name), disk);
        // A folder without a video (left over, or only extras) isn't the title.
        if (!files.length) return;
        titles.push({ kind, tmdbId: m[3], name: m[1], year: m[2] ? Number(m[2]) : null, disk, files });
      });
    }
  }
  return { titles, untagged };
}

// The probe of every file, new or changed ones read now. A file ffprobe
// can't read gets an empty probe, tried again when it changes.
async function probeAll(files: ScanFile[]): Promise<Map<string, Probe>> {
  const stored = getProbes();
  const result = new Map<string, Probe>();
  const todo: ScanFile[] = [];
  for (const f of files) {
    const s = stored.get(f.rel);
    if (s && s.size === f.size && s.mtime === f.mtime) result.set(f.rel, s.probe);
    else todo.push(f);
  }
  let done = 0;
  progress({ phase: "probing", done, total: todo.length });
  await mapWithConcurrency(todo, PROBES_AT_ONCE, async (f) => {
    const probe = await ffprobe(path.join(LIBRARY_DIR, f.rel)).catch((e) => {
      console.error(`[library-scan] ffprobe failed for ${f.rel}:`, (e as Error).message);
      return { seconds: null, codec: "", languages: [] } satisfies Probe;
    });
    setProbe(f.rel, { size: f.size, mtime: f.mtime, probe });
    result.set(f.rel, probe);
    progress({ phase: "probing", done: ++done, total: todo.length });
  });
  pruneProbes(new Set(files.map((f) => f.rel)));
  return result;
}

// Details of the titles TMDB hasn't been asked about yet (all of them for
// the TMDB sync's refresh, which leaves the scan's progress alone); without
// a TMDB key, none. How many requests failed.
async function fetchDetails(
  wanted: { kind: Kind; tmdbId: string }[],
  tmdb: { apiKey: string; language: string } | null,
  refresh = false,
): Promise<number> {
  if (!tmdb) return 0;
  const known = getDetails();
  // A title on several disks is asked about once.
  const unique = [...new Map(wanted.map((t) => [`${t.kind}:${t.tmdbId}`, t])).entries()];
  const todo = unique.filter(([key]) => refresh || !known.has(key)).map(([, t]) => t);
  let done = 0;
  const report = (n: number) => !refresh && progress({ phase: "tmdb", done: n, total: todo.length });
  report(done);
  let failed = 0;
  const found = await mapWithConcurrency(todo, TMDB_AT_ONCE, async (t) => {
    try {
      const details = await fetchTmdbDetails(tmdb.apiKey, t.kind, t.tmdbId, tmdb.language);
      if (!details) return null;
      const { seasons: _seasons, ...rest } = details;
      return { mediaType: t.kind, tmdbId: t.tmdbId, details: rest };
    } catch {
      failed++;
      return null;
    } finally {
      report(++done);
    }
  });
  setDetails(found.filter((f) => f !== null));
  return failed;
}

// A title's own fields: TMDB's where it has them, else the folder's. The
// folder's year wins, as Organize named it after TMDB's release date.
function titleFields(
  kind: Kind,
  tmdbId: string,
  folder: { name: string; year: number | null },
  details: TmdbDetails | undefined,
) {
  return {
    Id: tmdbId,
    Name: details?.name || folder.name,
    ProductionYear: folder.year ?? details?.year ?? undefined,
    ProviderIds:
      kind === "movie" ? { Tmdb: tmdbId, TmdbCollection: details?.collectionId ?? undefined } : { Tmdb: tmdbId },
    PosterPath: details?.posterPath ?? null,
    Genres: details?.genres ?? [],
  };
}

const mediaFile = (f: ScanFile, probe: Probe | undefined): MediaFile => ({
  Name: f.name,
  Folder: f.folder,
  Path: f.rel,
  Size: f.size,
  Codec: probe?.codec ?? "",
  Width: probe?.width,
  Height: probe?.height,
  Languages: probe?.languages ?? [],
});

const byName = (a: { Name: string }, b: { Name: string }) =>
  a.Name.localeCompare(b.Name, "de", { sensitivity: "base", numeric: true });

// A title on several disks, as one: its folders' files together.
function mergeFolders(titles: TitleFolder[], kind: Kind): TitleFolder[][] {
  const byId = new Map<string, TitleFolder[]>();
  for (const t of titles.filter((t) => t.kind === kind)) byId.set(t.tmdbId, [...(byId.get(t.tmdbId) ?? []), t]);
  return [...byId.values()];
}

function buildMovies(titles: TitleFolder[], probes: Map<string, Probe>, details: Map<string, TmdbDetails>) {
  const movies: LibraryMovie[] = [];
  const items: MediaItem[] = [];
  for (const folders of mergeFolders(titles, "movie")) {
    const { tmdbId } = folders[0];
    const files = folders.flatMap((f) => f.files).sort((a, b) => a.rel.localeCompare(b.rel));
    const first = files[0] && probes.get(files[0].rel);
    const movie: LibraryMovie = {
      ...titleFields("movie", tmdbId, folders[0], details.get(`movie:${tmdbId}`)),
      Disks: [...new Set(folders.map((f) => f.disk))],
      Width: first?.width,
      Height: first?.height,
      RunTimeTicks: first?.seconds ? Math.round(first.seconds * 10_000_000) : undefined,
      FileName: files[0]?.name,
      AudioLanguages: first?.languages ?? [],
    };
    movies.push(movie);
    items.push({
      kind: "movie",
      id: tmdbId,
      parentId: tmdbId,
      title: movie.Name,
      year: movie.ProductionYear ?? null,
      tmdbId,
      width: movie.Width,
      height: movie.Height,
      files: files.map((f) => mediaFile(f, probes.get(f.rel))),
    });
  }
  return { movies: movies.sort(byName), items };
}

// Each show with its episodes: one per SxxEyy (or SxxEyy-Ezz), every file
// of it a version. Files without one are left out (unnamed).
function buildShows(titles: TitleFolder[], probes: Map<string, Probe>, details: Map<string, TmdbDetails>) {
  const shows: LibraryShow[] = [];
  const episodes: LibraryEpisode[] = [];
  const items: MediaItem[] = [];
  const unnamed: string[] = [];
  for (const folders of mergeFolders(titles, "tv")) {
    const { tmdbId } = folders[0];
    const fields = titleFields("tv", tmdbId, folders[0], details.get(`tv:${tmdbId}`));
    const byEpisode = new Map<string, { season: number; first: number; last: number | null; files: ScanFile[] }>();
    for (const f of folders.flatMap((t) => t.files).sort((a, b) => a.rel.localeCompare(b.rel))) {
      const m = EPISODE.exec(f.name);
      if (!m) {
        unnamed.push(f.rel);
        continue;
      }
      const [season, first] = [Number(m[1]), Number(m[2])];
      const last = m[3] && Number(m[3]) > first ? Number(m[3]) : null;
      const key = `${season}:${first}${last ? `-${last}` : ""}`;
      const entry = byEpisode.get(key) ?? { season, first, last, files: [] };
      entry.files.push(f);
      byEpisode.set(key, entry);
    }
    const own = [...byEpisode.entries()].sort(([, a], [, b]) => a.season - b.season || a.first - b.first);
    for (const [key, e] of own) {
      const probe = probes.get(e.files[0].rel);
      const id = `${tmdbId}:${key}`;
      episodes.push({
        Id: id,
        SeriesId: tmdbId,
        ParentIndexNumber: e.season,
        IndexNumber: e.first,
        IndexNumberEnd: e.last,
        Size: e.files[0].size,
        AudioLanguages: probe?.languages ?? [],
      });
      items.push({
        kind: "episode",
        id,
        parentId: tmdbId,
        title: fields.Name,
        year: fields.ProductionYear ?? null,
        tmdbId,
        season: e.season,
        episode: e.first,
        episodeEnd: e.last,
        episodeTitle: null,
        files: e.files.map((f) => mediaFile(f, probes.get(f.rel))),
      });
    }
    shows.push({
      ...fields,
      Disks: [...new Set(folders.map((f) => f.disk))],
      Status: details.get(`tv:${tmdbId}`)?.status,
      ChildCount: new Set(own.map(([, e]) => e.season)).size,
      RecursiveItemCount: own.length,
    });
  }
  return { shows: shows.sort(byName), episodes, items, unnamed };
}

export async function scanLibrary(tmdb: { apiKey: string; language: string } | null) {
  if (!LIBRARY_DIR) throw new Error("Set LIBRARY_DIR to the library's disks (each with movies/ and shows/).");
  try {
    progress({ phase: "listing", done: 0, total: 0 });
    const { titles, untagged } = await listTitles();
    if (!titles.length) throw new Error(`No title folders ("Name (Year) [tmdbid-N]") in ${LIBRARY_DIR}.`);
    const probes = await probeAll(titles.flatMap((t) => t.files));
    const tmdbFailed = await fetchDetails(titles, tmdb);

    progress({ phase: "saving", done: 0, total: 0 });
    const details = getDetails();
    const { movies, items: movieItems } = buildMovies(titles, probes, details);
    const { shows, episodes, items: episodeItems, unnamed } = buildShows(titles, probes, details);
    const syncedAt = new Date().toISOString();
    replaceLibrary({ movies, shows, episodes, files: storedFiles([...movieItems, ...episodeItems]) }, syncedAt);
    if (untagged.length) console.warn(`[library-scan] ${untagged.length} folders without [tmdbid-N]:`, untagged);
    if (unnamed.length) console.warn(`[library-scan] ${unnamed.length} show files without SxxEyy:`, unnamed);
    return {
      movies: movies.length,
      shows: shows.length,
      episodes: episodes.length,
      untagged: untagged.length,
      unnamed: unnamed.length,
      tmdbFailed,
      syncedAt,
    };
  } finally {
    progress(null);
  }
}

// The TMDB sync's part: every library title's details asked for again (a
// show ends, a poster changes) and written into the stored titles.
export async function refreshDetails(tmdb: { apiKey: string; language: string }) {
  const movies = getMovies();
  const shows = getShows();
  const failed = await fetchDetails(
    [
      ...movies.map((m) => ({ kind: "movie" as const, tmdbId: m.Id })),
      ...shows.map((s) => ({ kind: "tv" as const, tmdbId: s.Id })),
    ],
    tmdb,
    true,
  );
  const details = getDetails();
  const folder = (t: { Name: string; ProductionYear?: number }) => ({ name: t.Name, year: t.ProductionYear ?? null });
  updateTitles(
    movies.map((m) => ({ ...m, ...titleFields("movie", m.Id, folder(m), details.get(`movie:${m.Id}`)) })),
    shows.map((s) => {
      const d = details.get(`tv:${s.Id}`);
      return { ...s, ...titleFields("tv", s.Id, folder(s), d), Status: d?.status ?? s.Status };
    }),
  );
  return failed;
}
