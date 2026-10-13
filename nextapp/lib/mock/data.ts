// Made-up Queue data for `next dev` (Mock data, lib/mock/fetch.ts):
// every state the page can show, a package each (and a wishlist for the Dashboard), without touching the
// database. /api/downloads and /api/organize answer about the same
// packages (an Organize item's id is its package's), so the sidebar's
// count adds up. Paths as the routes give them: an owned
// file's and a moved one's under LIBRARY_DIR ("nvme02/movies/…"), a
// target's absolute. Typed by the routes' responses, so a changed response
// type breaks the typecheck here; a new state on the page gets an example
// here too.
import type {
  DownloadFileItem,
  DownloadPackageItem,
  DownloadsResponse,
  OrganizeItem,
  OrganizeMoved,
  OrganizeResponse,
  RequestItem,
  RequestsResponse,
} from "@/lib/api-types";
import type { MoveProgress } from "@/lib/library-move";

const GB = 1e9;
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

let fileId = 1;
function parts(
  release: string,
  n: number,
  size: number,
  status: DownloadFileItem["status"],
  opts: Partial<DownloadFileItem>[] = [],
): DownloadFileItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: fileId++,
    url: `https://ddownload.com/${release.slice(0, 6).toLowerCase()}${i}`,
    name: `${release.toLowerCase()}.part${String(i + 1).padStart(2, "0")}.rar`,
    size,
    received: status === "done" || status === "extracted" ? size : 0,
    status,
    error: null,
    speed: null,
    checked: status === "queued" ? "online" : null,
    ...opts[i],
  }));
}

// A show's episodes as files of their own (no archive), S01E01 on.
function episodes(
  release: string,
  season: number,
  n: number,
  size: number,
  status: DownloadFileItem["status"],
  opts: (i: number) => Partial<DownloadFileItem> = () => ({}),
): DownloadFileItem[] {
  const code = (i: number) => `.S${String(season).padStart(2, "0")}E${String(i + 1).padStart(2, "0")}.`;
  return Array.from({ length: n }, (_, i) => ({
    id: fileId++,
    url: `https://ddownload.com/${release.slice(0, 6).toLowerCase()}e${i}`,
    name: release.replace(/\.S\d\d\./, code(i)) + ".mkv",
    size,
    received: status === "done" || status === "extracted" ? size : 0,
    status,
    error: null,
    speed: null,
    checked: status === "queued" ? "online" : null,
    ...opts(i),
  }));
}

// What the library has of a movie: another version on disk, so Replace.
const otherMovie = (disk: string, folder: string, file: string, release: string): DownloadPackageItem["library"] => ({
  old: [`${disk}/movies/${folder}/${file}`],
  new: [release],
  exact: false,
  skip: 1,
  choices: ["replace"],
  disks: [disk],
});

function pkg(
  id: number,
  name: string,
  status: DownloadPackageItem["status"],
  media: DownloadPackageItem["media"],
  files: DownloadFileItem[],
  more: Partial<DownloadPackageItem> = {},
): DownloadPackageItem {
  return {
    id,
    name,
    dir: name,
    status,
    error: null,
    createdAt: ago(600 - id * 10),
    startedAt: status === "pending" ? null : ago(300 - id * 5),
    finishedAt: status === "done" ? ago(120 - id) : null,
    media,
    matched: true,
    movedTo: null,
    movedAt: null,
    movedFiles: null,
    replaced: false,
    choice: null,
    library: null,
    sources: ["ddownload"],
    outputs: [],
    extractPercent: null,
    files,
    ...more,
  };
}

// posterPath: a real one where the Dashboard shows posters (Last imports).
const movie = (tmdbId: number, title: string, year: number, posterPath: string | null = null) => ({
  type: "movie" as const,
  tmdbId,
  title,
  year,
  posterPath,
});
const show = (tmdbId: number, title: string, year: number, posterPath: string | null = null) => ({
  type: "tv" as const,
  tmdbId,
  title,
  year,
  posterPath,
});
type Media = ReturnType<typeof movie> | ReturnType<typeof show>;

// "Name (Year) [tmdbid-N]", as lib/library-names.ts names a title's folder.
const folderOf = (m: Media) => `${m.title.replace(/:/g, " -")} (${m.year}) [tmdbid-${m.tmdbId}]`;

const disks = [
  { disk: "nvme01", freeBytes: 412 * GB, totalBytes: 4000 * GB },
  { disk: "nvme02", freeBytes: 1290 * GB, totalBytes: 4000 * GB },
  { disk: "nvme03", freeBytes: 96 * GB, totalBytes: 2000 * GB },
  { disk: "nvme04", freeBytes: 2730 * GB, totalBytes: 8000 * GB },
];
const targets = (kind: "movies" | "shows", folder: string, existingOn?: string) =>
  disks.map((d) => ({
    path: `/library/${d.disk}/${kind}`,
    disk: d.disk,
    freeBytes: d.freeBytes,
    existing: d.disk === existingOn ? folder : null,
  }));

const move = (target: string, more: Partial<MoveProgress>): MoveProgress => ({
  target,
  done: 0,
  total: 0,
  phase: "copying",
  speed: 0,
  running: true,
  error: null,
  ...more,
});

// A finished package, and how Organize lists it: to move (item), or moved
// (moved); its files are what it brings, each one's path in the title's
// folder.
type Finished = {
  id: number;
  name: string;
  media: Media | null;
  files: string[];
  bytes: number;
  item?: Partial<OrganizeItem>;
  moved?: { disk: string; minutes: number; replaced?: boolean };
};

const INTERSTELLAR = "Interstellar.2014.German.DL.1080p.BluRay.x264-DETAiLS";
const BEAR = "The.Bear.S03.German.DL.1080p.WEB.H264-WvF";

function finished(): Finished[] {
  const interstellar = movie(157336, "Interstellar", 2014);
  const bear = show(136315, "The Bear", 2022);
  const bearEpisode = (e: number) => `Season 03/${BEAR.replace(".S03.", `.S03E${String(e).padStart(2, "0")}.`)}.mkv`;
  return [
    // Ready to organize: a show new to the library; one that fits on no disk.
    {
      id: 20,
      name: "Fallout.S01.German.DL.1080p.WEB.H265-GROUP",
      media: show(106379, "Fallout", 2024),
      files: Array.from({ length: 8 }, (_, i) => `Season 01/Fallout.S01E0${i + 1}.German.DL.1080p.WEB.H265-GROUP.mkv`),
      bytes: 17.6 * GB,
    },
    // A pack of two seasons: a folder each.
    {
      id: 39,
      name: "The.Sopranos.S01-S06.German.DL.2160p.UHD.BluRay.REMUX-WAYNE",
      media: show(1398, "The Sopranos", 1999),
      files: [`Season 01/The.Sopranos.S01E01.German.DL.2160p.UHD.BluRay.REMUX-WAYNE.mkv`],
      bytes: 2900 * GB,
    },
    // The library has it: another release (with its subtitles), two of a
    // show's ten episodes.
    {
      id: 23,
      name: INTERSTELLAR,
      media: interstellar,
      files: [`${INTERSTELLAR}.mkv`],
      bytes: 15.8 * GB,
      item: {
        targets: targets("movies", folderOf(interstellar), "nvme02"),
        owned: [
          {
            path: `nvme02/movies/${folderOf(interstellar)}/Interstellar.2014.German.DL.720p.BluRay.x264-SPARKS.mkv`,
            size: 6.1 * GB,
            extras: [
              `nvme02/movies/${folderOf(interstellar)}/Interstellar.2014.German.DL.720p.BluRay.x264-SPARKS.de.srt`,
            ],
          },
        ],
      },
    },
    {
      id: 25,
      name: BEAR,
      media: bear,
      files: Array.from({ length: 10 }, (_, i) => bearEpisode(i + 1)),
      bytes: 14.5 * GB,
      item: {
        targets: targets("shows", folderOf(bear), "nvme04"),
        owned: [1, 2].map((e) => ({
          path: `nvme04/shows/${folderOf(bear)}/Season 03/The.Bear.S03E0${e}.German.720p.WEB.h264-SAUERKRAUT.mkv`,
          size: 0.9 * GB,
          extras: [],
        })),
      },
    },
    // Moving: copying, verifying.
    {
      id: 27,
      name: "Nosferatu.2024.German.DL.1080p.WEB.H264-ZeroTwo",
      media: movie(426063, "Nosferatu", 2024),
      files: ["Nosferatu.2024.German.DL.1080p.WEB.H264-ZeroTwo.mkv"],
      bytes: 6.4 * GB,
      item: { move: move("/library/nvme04/movies", { done: 2.9 * GB, total: 6.4 * GB, speed: 412e6 }) },
    },
    {
      id: 28,
      name: "The.Brutalist.2024.German.DL.1080p.WEB.H264-WvF",
      media: movie(549509, "The Brutalist", 2024),
      files: ["The.Brutalist.2024.German.DL.1080p.WEB.H264-WvF.mkv"],
      bytes: 9.2 * GB,
      item: {
        move: move("/library/nvme01/movies", { done: 4.1 * GB, total: 9.2 * GB, phase: "verifying", speed: 980e6 }),
      },
    },
    // Needs attention: a move that failed, one that can't be moved.
    {
      id: 29,
      name: "Conclave.2024.German.DL.1080p.WEB.H264-SAUERKRAUT",
      media: movie(974576, "Conclave", 2024),
      files: ["Conclave.2024.German.DL.1080p.WEB.H264-SAUERKRAUT.mkv"],
      bytes: 5.1 * GB,
      item: {
        move: move("/library/nvme03/movies", {
          done: 5.1 * GB,
          total: 5.1 * GB,
          phase: "verifying",
          running: false,
          error: "Conclave.2024.German.DL.1080p.WEB.H264-SAUERKRAUT.mkv: the copy doesn't match the original",
        }),
      },
    },
    {
      id: 30,
      name: "Some.Unknown.Release.2023.German.1080p.WEB.x264-NOGRP",
      media: null,
      files: [],
      bytes: 3.3 * GB,
      item: { error: "It isn't matched to a movie or show on TMDB." },
    },
    // Done: moved, replaced.
    {
      id: 33,
      name: "The.Wild.Robot.2024.German.DL.2160p.WEB.H265-ZeroTwo",
      media: movie(1184918, "The Wild Robot", 2024, "/jOZCN1IpDivlnfJKd4o2V1GCthe.jpg"),
      files: ["The.Wild.Robot.2024.German.DL.2160p.WEB.H265-ZeroTwo.mkv"],
      bytes: 14.2 * GB,
      moved: { disk: "nvme04", minutes: 42 },
    },
    {
      id: 34,
      name: "The.Penguin.S01.German.DL.1080p.WEB.H264-WvF",
      media: show(194764, "The Penguin", 2024, "/fxFYHRGfTQeTU6G99EZeQHM0jrt.jpg"),
      files: Array.from(
        { length: 8 },
        (_, i) => `Season 01/The.Penguin.S01E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`,
      ),
      bytes: 18.9 * GB,
      moved: { disk: "nvme02", minutes: 180, replaced: true },
    },
    {
      id: 35,
      name: "The.Penguin.S02.German.DL.1080p.WEB.H264-WvF",
      media: show(194764, "The Penguin", 2024, "/fxFYHRGfTQeTU6G99EZeQHM0jrt.jpg"),
      files: Array.from(
        { length: 8 },
        (_, i) => `Season 02/The.Penguin.S02E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`,
      ),
      bytes: 19.4 * GB,
      moved: { disk: "nvme02", minutes: 90 },
    },
    {
      id: 36,
      name: "Gladiator.II.2024.German.DL.1080p.BluRay.x265-VECTOR",
      media: movie(558449, "Gladiator II", 2024, "/kLkMt9bB7XDzwQ5wy6OWtdpwgcD.jpg"),
      files: ["Gladiator.II.2024.German.DL.1080p.BluRay.x265-VECTOR.mkv"],
      bytes: 10.1 * GB,
      moved: { disk: "nvme01", minutes: 15 },
    },
    {
      id: 37,
      name: "Dune.Part.Two.2024.German.DL.2160p.UHD.BluRay.x265-VECTOR",
      media: movie(693134, "Dune: Part Two", 2024, "/zYLP7Uiqz6XqoiQLAu4XQ6DRUMz.jpg"),
      files: ["Dune.Part.Two.2024.German.DL.2160p.UHD.BluRay.x265-VECTOR.mkv"],
      bytes: 34 * GB,
      moved: { disk: "nvme01", minutes: 300 },
    },
    {
      id: 38,
      name: "Deadpool.and.Wolverine.2024.German.DL.1080p.BluRay.x264-ZeroTwo",
      media: movie(533535, "Deadpool & Wolverine", 2024, "/chDpMyvXNDFMhg3yUknITnGUCUk.jpg"),
      files: ["Deadpool.and.Wolverine.2024.German.DL.1080p.BluRay.x264-ZeroTwo.mkv"],
      bytes: 12.4 * GB,
      moved: { disk: "nvme03", minutes: 600 },
    },
    {
      id: 39,
      name: "Slow.Horses.S04.German.DL.1080p.WEB.H264-WvF",
      media: show(95480, "Slow Horses", 2022, "/iGlInaVyhWQm3whmikpLHivO1Wd.jpg"),
      files: Array.from(
        { length: 6 },
        (_, i) => `Season 04/Slow.Horses.S04E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`,
      ),
      bytes: 15.2 * GB,
      moved: { disk: "nvme02", minutes: 1500 },
    },
    {
      id: 40,
      name: "Arcane.S02.German.DL.1080p.WEB.H264-WvF",
      media: show(94605, "Arcane", 2021, "/fqldf2t8ztc9aiwn3k6mlX3tvRT.jpg"),
      files: Array.from({ length: 9 }, (_, i) => `Season 02/Arcane.S02E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`),
      bytes: 21 * GB,
      moved: { disk: "nvme04", minutes: 2400 },
    },
  ];
}

const movedTo = (f: Finished) =>
  `${f.moved!.disk}/${f.media?.type === "tv" ? "shows" : "movies"}/${f.media ? folderOf(f.media) : f.name}`;
const base = (file: string) => file.split("/").pop()!;

const SEVERANCE = "Severance.S02.German.DL.1080p.WEB.H264-WvF";
const ARRIVAL = "Arrival.2016.German.DL.1080p.BluRay.x264-SPiCY";
const PERFECT = "Perfect.Days.2023.German.DL.1080p.BluRay.x264-DETAiLS";
const UNMATCHED = "Kleine.Schweinereien.2024.German.1080p.WEB.x264-NOGRP";
const BLADE = "Blade.Runner.2049.2017.German.DL.2160p.UHD.BluRay.x265-ZQ";
const SHOGUN = "Shogun.2024.S01.German.DL.2160p.DSNP.WEB.H265-TVARCHiV";
const FURIOSA = "Furiosa.A.Mad.Max.Saga.2024.German.DL.1080p.BluRay.AVC-HDMP";
const ALIEN = "Alien.Romulus.2024.German.DL.1080p.WEB.H264-ZeroTwo";
const ANDOR = "Andor.S02E01.German.DL.1080p.WEB.H264-SAUERKRAUT";
const OPPENHEIMER = "Oppenheimer.2023.German.DL.2160p.UHD.BluRay.x265-WAYNE";
const PASTLIVES = "Past.Lives.2023.German.DL.1080p.BluRay.x264-DETAiLS";

export function mockDownloads(): DownloadsResponse {
  fileId = 1;
  return {
    ready: true,
    downloadDir: "/downloads",
    freeBytes: 812.4 * GB,
    slots: 3,
    maxSlots: 10,
    packages: [
      // Needs attention, new: only what waits for a hand, since anything the
      // library has nothing of starts right away (startIfNew). A show some
      // of whose episodes of this very release the library has (Skip),
      // still being checked; movies it has another version of (Replace),
      // all of (Remove); parts no account can fetch, a part missing from the
      // numbering (both red); one TMDB found nothing for.
      pkg(
        2,
        SEVERANCE,
        "pending",
        show(95396, "Severance", 2022),
        episodes(SEVERANCE, 2, 10, 2 * GB, "queued", (i) => ({ checked: i < 7 ? "online" : null })),
        {
          library: {
            old: [1, 2, 3, 4].map(
              (e) =>
                `nvme02/shows/Severance (2022) [tmdbid-95396]/Season 02/${SEVERANCE.replace(".S02.", `.S02E0${e}.`)}.mkv`,
            ),
            new: [5, 6, 7, 8, 9, 10].map(
              (e) => `Season 02/${SEVERANCE.replace(".S02.", `.S02E${String(e).padStart(2, "0")}.`)}`,
            ),
            exact: true,
            skip: 4,
            choices: ["skip"],
            disks: ["nvme02"],
          },
        },
      ),
      pkg(14, OPPENHEIMER, "pending", movie(872585, "Oppenheimer", 2023), parts(OPPENHEIMER, 6, 4 * GB, "queued"), {
        library: {
          old: [
            "nvme03/movies/Oppenheimer (2023) [tmdbid-872585]/Oppenheimer.2023.German.DL.1080p.BluRay.x264-OLD.mkv",
          ],
          new: [OPPENHEIMER],
          exact: false,
          skip: 1,
          choices: ["replace"],
          disks: ["nvme03"],
        },
      }),
      pkg(17, PASTLIVES, "pending", movie(666277, "Past Lives", 2023), parts(PASTLIVES, 3, 3 * GB, "queued"), {
        library: {
          old: [`nvme02/movies/Past Lives (2023) [tmdbid-666277]/${PASTLIVES}.mkv`],
          new: [],
          exact: true,
          skip: 1,
          choices: [],
          disks: ["nvme02"],
        },
      }),
      pkg(
        3,
        ARRIVAL,
        "pending",
        movie(329865, "Arrival", 2016),
        parts(ARRIVAL, 3, 3 * GB, "failed", [
          { error: "No account for its hoster" },
          { error: "No account for its hoster" },
          {},
        ]).map((f, i) => (i === 2 ? { ...f, status: "queued" as const, checked: "online" as const } : f)),
        {
          sources: ["no account", "ddownload"],
          library: otherMovie(
            "nvme02",
            "Arrival (2016) [tmdbid-329865]",
            "Arrival.2016.German.DL.720p.BluRay.x264-OLD.mkv",
            ARRIVAL,
          ),
        },
      ),
      pkg(
        4,
        PERFECT,
        "pending",
        movie(976893, "Perfect Days", 2023),
        parts(PERFECT, 4, 2 * GB, "queued").map((f, i) =>
          i === 3 ? { ...f, name: f.name.replace("part04", "part05") } : f,
        ),
        {
          library: otherMovie(
            "nvme01",
            "Perfect Days (2023) [tmdbid-976893]",
            "Perfect.Days.2023.German.720p.WEB.h264-OLD.mkv",
            PERFECT,
          ),
        },
      ),
      pkg(6, UNMATCHED, "pending", null, parts(UNMATCHED, 2, 2 * GB, "queued")),
      // Needs attention, failed: a part gone and another that failed for
      // another reason (+1).
      pkg(
        7,
        BLADE,
        "failed",
        movie(335984, "Blade Runner 2049", 2017),
        parts(BLADE, 4, 5 * GB, "failed", [
          { error: "File not found (offline)" },
          { error: "The hoster answered HTTP 503" },
        ]).map((f, i) => (i < 2 ? f : { ...f, status: "done" as const, received: f.size ?? 0 })),
        {
          error: [
            `${BLADE.toLowerCase()}.part01.rar: File not found (offline)`,
            `${BLADE.toLowerCase()}.part02.rar: The hoster answered HTTP 503`,
          ].join("\n"),
        },
      ),
      // Downloading: loading, extracting, waiting, paused.
      pkg(9, SHOGUN, "downloading", show(126308, "Shōgun", 2024), [
        ...parts(SHOGUN, 4, 5 * GB, "done"),
        ...parts(SHOGUN, 2, 5 * GB, "downloading", [
          { received: 3.1 * GB, speed: 46.2e6 },
          // Its size unknown: how much is here, no share.
          { received: 1.4 * GB, speed: 38.9e6, size: null },
        ]),
        ...parts(SHOGUN, 3, 5 * GB, "queued"),
      ]),
      pkg(
        10,
        FURIOSA,
        "extracting",
        movie(786892, "Furiosa: A Mad Max Saga", 2024),
        parts(FURIOSA, 5, 4 * GB, "done"),
        {
          extractPercent: 58,
        },
      ),
      pkg(11, ALIEN, "queued", movie(945961, "Alien: Romulus", 2024), parts(ALIEN, 3, 3 * GB, "queued")),
      pkg(12, ANDOR, "paused", show(83867, "Andor", 2022), parts(ANDOR, 2, 2 * GB, "queued", [{ received: 0.7 * GB }])),
      // Finished: Ready to organize and Done (above).
      ...finished().map((f) =>
        pkg(f.id, f.name, "done", f.media, [], {
          outputs: f.files.map((file) => ({ path: `${f.name}/${base(file)}`, size: f.bytes / f.files.length })),
          ...(f.moved
            ? {
                movedTo: movedTo(f),
                movedAt: ago(f.moved.minutes),
                movedFiles: f.files.map((to) => ({ from: `${f.name}/${base(to)}`, to })),
                replaced: f.moved.replaced ?? false,
              }
            : {}),
        }),
      ),
    ],
  };
}

export function mockOrganize(): OrganizeResponse {
  const all = finished();
  const items: OrganizeItem[] = all
    .filter((f) => !f.moved)
    .map((f) => ({
      id: f.id,
      name: f.name,
      media: f.media,
      folder: f.media ? folderOf(f.media) : "",
      files: f.files,
      bytes: f.bytes,
      error: null,
      targets: f.media && !f.item?.error ? targets(f.media.type === "tv" ? "shows" : "movies", folderOf(f.media)) : [],
      owned: [],
      move: null,
      ...f.item,
    }));
  const moved: OrganizeMoved[] = all
    .filter((f) => f.moved)
    .map((f) => ({
      id: f.id,
      name: f.name,
      media: f.media,
      movedTo: movedTo(f),
      movedAt: ago(f.moved!.minutes),
      files: f.files,
      bytes: f.bytes,
      replaced: f.moved!.replaced ?? false,
    }))
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt));
  return { ready: true, libraryDir: "/library", disks, items, moved };
}

// The wishlist, as the Dashboard lists it (posters are real, from TMDB).
export function mockRequests(): RequestsResponse {
  const wish = (
    mediaType: RequestItem["mediaType"],
    tmdbId: number,
    title: string,
    year: number,
    posterPath: string,
    minutes: number,
  ): RequestItem => ({
    mediaType,
    tmdbId,
    title,
    year,
    releaseDate: `${year}-01-01`,
    posterPath,
    requestedAt: ago(minutes),
    mine: true,
    library: null,
    availability: null,
  });
  return {
    items: [
      wish("tv", 123542, "Link Click", 2021, "/44cNZ5PmLOwTIOkYwlAewgzn8Bl.jpg", 35),
      wish("movie", 1148365, "Matchbox: Der Film", 2026, "/fwMAJmJmTFtBN8wbgPJ2wfhnDEa.jpg", 180),
      wish("movie", 1291595, "Insidious: Out of the Further", 2026, "/h1ezty0cBhJjoFP4Oj88hJ0u0Go.jpg", 60 * 24),
      wish("movie", 1302904, "Practical Magic 2", 2026, "/gprNY1uglCDkiG0uqvAjTPT4GJ3.jpg", 60 * 24 * 2),
      wish("movie", 1153576, "Street Fighter", 2026, "/6HNssAfOCjAO4uEqCqhzKHBApxN.jpg", 60 * 24 * 4),
      wish("tv", 285322, "Below", 2026, "/vgLqqhMUbljp585qPp1EFCyJtcz.jpg", 60 * 24 * 6),
    ],
    all: false,
    admin: true,
  };
}
