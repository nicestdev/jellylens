// Made-up Queue data for `next dev` (Mock data, lib/mock/fetch.ts):
// every state the page can show, a package each, without touching the
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

const movie = (tmdbId: number, title: string, year: number) => ({
  type: "movie" as const,
  tmdbId,
  title,
  year,
  posterPath: null,
});
const show = (tmdbId: number, title: string, year: number) => ({
  type: "tv" as const,
  tmdbId,
  title,
  year,
  posterPath: null,
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
  back: false,
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
  moved?: { disk: string; minutes: number; replaced?: boolean; move?: MoveProgress; noFiles?: boolean };
};

const INTERSTELLAR = "Interstellar.2014.German.DL.1080p.BluRay.x264-DETAiLS";
const HERETIC = "Heretic.2024.German.DL.1080p.WEB.H264-WAYNE";
const BEAR = "The.Bear.S03.German.DL.1080p.WEB.H264-WvF";
const LOTR = "The.Lord.of.the.Rings.The.Return.of.the.King.2003.EXTENDED.German.DL.2160p.UHD.BluRay.REMUX-WAYNE";

function finished(): Finished[] {
  const interstellar = movie(157336, "Interstellar", 2014);
  const heretic = movie(1138194, "Heretic", 2024);
  const bear = show(136315, "The Bear", 2022);
  const bearEpisode = (e: number) => `Season 03/${BEAR.replace(".S03.", `.S03E${String(e).padStart(2, "0")}.`)}.mkv`;
  return [
    // Ready to organize: shows and movies new to the library; one too big
    // for nvme03 (red in the disk menu).
    {
      id: 20,
      name: "Fallout.S01.German.DL.1080p.WEB.H265-GROUP",
      media: show(106379, "Fallout", 2024),
      files: Array.from({ length: 8 }, (_, i) => `Season 01/Fallout.S01E0${i + 1}.German.DL.1080p.WEB.H265-GROUP.mkv`),
      bytes: 17.6 * GB,
    },
    // A pack of two seasons: a folder each.
    {
      id: 38,
      name: "Arcane.S01-S02.German.DL.1080p.WEB.H264-WvF",
      media: show(94605, "Arcane", 2021),
      files: [1, 2].flatMap((s) =>
        Array.from({ length: 9 }, (_, i) => `Season 0${s}/Arcane.S0${s}E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`),
      ),
      bytes: 21.3 * GB,
    },
    // Fits on no disk: "Pick" for a disk, only Delete in its ⋯.
    {
      id: 39,
      name: "The.Sopranos.S01-S06.German.DL.2160p.UHD.BluRay.REMUX-WAYNE",
      media: show(1398, "The Sopranos", 1999),
      files: [`Season 01/The.Sopranos.S01E01.German.DL.2160p.UHD.BluRay.REMUX-WAYNE.mkv`],
      bytes: 2900 * GB,
    },
    {
      id: 21,
      name: "Flow.2024.German.DL.1080p.BluRay.x264-ROCKEFELLER",
      media: movie(823219, "Flow", 2024),
      files: ["Flow.2024.German.DL.1080p.BluRay.x264-ROCKEFELLER.mkv"],
      bytes: 8.4 * GB,
    },
    {
      id: 22,
      name: LOTR,
      media: movie(122, "The Lord of the Rings: The Return of the King", 2003),
      files: [`${LOTR}.mkv`],
      bytes: 142 * GB,
    },
    // The library has it: another release (with its subtitles), the very
    // same release, two of a show's ten episodes.
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
      id: 24,
      name: HERETIC,
      media: heretic,
      files: [`${HERETIC}.mkv`],
      bytes: 5.8 * GB,
      item: {
        targets: targets("movies", folderOf(heretic), "nvme01"),
        owned: [{ path: `nvme01/movies/${folderOf(heretic)}/${HERETIC}.mkv`, size: 5.8 * GB, extras: [] }],
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
    // Moving: waiting for the one before, copying, verifying.
    {
      id: 26,
      name: "Moana.2.2024.German.DL.1080p.WEB.H264-ZeroTwo",
      media: movie(1241982, "Moana 2", 2024),
      files: ["Moana.2.2024.German.DL.1080p.WEB.H264-ZeroTwo.mkv"],
      bytes: 6.2 * GB,
      item: { move: move("/library/nvme02/movies", { total: 6.2 * GB, running: false }) },
    },
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
    // Needs attention: a move that failed, and ones that can't be moved (not
    // matched, a show's file without a season, no video).
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
    {
      id: 31,
      name: "Slow.Horses.Complete.German.DL.1080p.WEB.H264-RUBBiSH",
      media: show(95480, "Slow Horses", 2022),
      files: [],
      bytes: 21.7 * GB,
      item: { error: "No season in Slow.Horses.E01.German.DL.1080p.mkv." },
    },
    {
      id: 32,
      name: "Wallace.and.Gromit.Vengeance.Most.Fowl.2024.German.DL.1080p.WEB-SUBS",
      media: movie(929204, "Wallace & Gromit: Vengeance Most Fowl", 2024),
      files: [],
      bytes: 0.1 * GB,
      item: { error: "No video in it." },
    },
    // Done: moved, replaced, one whose files aren't known (no Undo); an
    // Undo running; an Undo that failed (Needs attention).
    {
      id: 33,
      name: "The.Wild.Robot.2024.German.DL.2160p.WEB.H265-ZeroTwo",
      media: movie(1184918, "The Wild Robot", 2024),
      files: ["The.Wild.Robot.2024.German.DL.2160p.WEB.H265-ZeroTwo.mkv"],
      bytes: 14.2 * GB,
      moved: { disk: "nvme04", minutes: 42 },
    },
    {
      id: 34,
      name: "The.Penguin.S01.German.DL.1080p.WEB.H264-WvF",
      media: show(194764, "The Penguin", 2024),
      files: Array.from(
        { length: 8 },
        (_, i) => `Season 01/The.Penguin.S01E0${i + 1}.German.DL.1080p.WEB.H264-WvF.mkv`,
      ),
      bytes: 18.9 * GB,
      moved: { disk: "nvme02", minutes: 180, replaced: true },
    },
    {
      id: 35,
      name: "Civil.War.2024.German.DL.1080p.BluRay.x264-DETAiLS",
      media: movie(929590, "Civil War", 2024),
      files: ["Civil.War.2024.German.DL.1080p.BluRay.x264-DETAiLS.mkv"],
      bytes: 9.6 * GB,
      moved: { disk: "nvme01", minutes: 60 * 26, noFiles: true },
    },
    {
      id: 36,
      name: "Gladiator.II.2024.German.DL.1080p.BluRay.x265-VECTOR",
      media: movie(558449, "Gladiator II", 2024),
      files: ["Gladiator.II.2024.German.DL.1080p.BluRay.x265-VECTOR.mkv"],
      bytes: 10.1 * GB,
      moved: {
        disk: "nvme01",
        minutes: 15,
        move: move("/library/nvme01/movies", { back: true, done: 3.3 * GB, total: 10.1 * GB, speed: 380e6 }),
      },
    },
    {
      id: 37,
      name: "Anora.2024.German.DL.1080p.WEB.H265-FuN",
      media: movie(1064213, "Anora", 2024),
      files: ["Anora.2024.German.DL.1080p.WEB.H265-FuN.mkv"],
      bytes: 7.3 * GB,
      moved: {
        disk: "nvme03",
        minutes: 95,
        move: move("/library/nvme03/movies", {
          back: true,
          done: 1.8 * GB,
          total: 7.3 * GB,
          running: false,
          error: "Anora.2024.German.DL.1080p.WEB.H265-FuN.mkv: only 1.80 GB of 7.30 GB were copied",
        }),
      },
    },
  ];
}

const movedTo = (f: Finished) =>
  `${f.moved!.disk}/${f.media?.type === "tv" ? "shows" : "movies"}/${f.media ? folderOf(f.media) : f.name}`;
const base = (file: string) => file.split("/").pop()!;

const DUNE = "Dune.Part.Two.2024.German.DL.2160p.UHD.BluRay.HDR.x265-WAYNE";
const SEVERANCE = "Severance.S02.German.DL.1080p.WEB.H264-WvF";
const ARRIVAL = "Arrival.2016.German.DL.1080p.BluRay.x264-SPiCY";
const PERFECT = "Perfect.Days.2023.German.DL.1080p.BluRay.x264-DETAiLS";
const WICKED = "Wicked.2024.German.DL.2160p.WEB.H265-SPiCY";
const UNMATCHED = "Kleine.Schweinereien.2024.German.1080p.WEB.x264-NOGRP";
const BLADE = "Blade.Runner.2049.2017.German.DL.2160p.UHD.BluRay.x265-ZQ";
const SUBSTANCE = "The.Substance.2024.German.DL.1080p.BluRay.x265-FuN";
const SHOGUN = "Shogun.2024.S01.German.DL.2160p.DSNP.WEB.H265-TVARCHiV";
const FURIOSA = "Furiosa.A.Mad.Max.Saga.2024.German.DL.1080p.BluRay.AVC-HDMP";
const ALIEN = "Alien.Romulus.2024.German.DL.1080p.WEB.H264-ZeroTwo";
const ANDOR = "Andor.S02E01.German.DL.1080p.WEB.H264-SAUERKRAUT";
const TLOU = "The.Last.of.Us.S02.German.DL.1080p.WEB.H265-GROUP";
const OPPENHEIMER = "Oppenheimer.2023.German.DL.2160p.UHD.BluRay.x265-WAYNE";
const SILO = "Silo.S02.German.DL.1080p.WEB.x265-w00t";
const SLOW = "Slow.Horses.S04.German.DL.1080p.WEB.H264-WvF";
const PASTLIVES = "Past.Lives.2023.German.DL.1080p.BluRay.x264-DETAiLS";
const TWISTERS = "Twisters.2024.German.DL.1080p.WEB.H264-ZeroTwo";

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
      // still being checked; movies it has another version of (Replace)
      // with parts no account can fetch, a part missing from the numbering
      // (both red over the diffstat), one the hoster didn't answer for;
      // one TMDB found nothing for.
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
            new: [5, 6, 7, 8, 9, 10].map((e) => `Season 02/S02E${String(e).padStart(2, "0")}`),
            exact: true,
            skip: 4,
            choices: ["skip"],
            disks: ["nvme02"],
          },
        },
      ),
      // The library has another version: a movie (Replace), a show's
      // episodes, archived one per episode under short names (Replace, all
      // coming); a season pack in one archive of the very release (Skip,
      // the pack coming whole); the very release of a movie (only Remove).
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
      pkg(
        15,
        SILO,
        "pending",
        show(125988, "Silo", 2023),
        Array.from({ length: 10 }, (_, i) => ({
          ...parts(SILO, 1, 1.6 * GB, "queued")[0],
          name: `Silo1080S02E${String(i + 1).padStart(2, "0")}.rar`,
        })),
        {
          library: {
            old: [1, 2, 3].map(
              (e) => `nvme01/shows/Silo (2023) [tmdbid-125988]/Season 02/Silo.S02E0${e}.German.720p.WEB.h264-OLD.mkv`,
            ),
            new: Array.from({ length: 10 }, (_, i) => `Season 02/S02E${String(i + 1).padStart(2, "0")}`),
            exact: false,
            skip: 3,
            choices: ["replace"],
            disks: ["nvme01"],
          },
        },
      ),
      pkg(16, SLOW, "pending", show(95480, "Slow Horses", 2022), parts(SLOW, 5, 3 * GB, "queued"), {
        library: {
          old: [1, 2].map(
            (e) =>
              `nvme04/shows/Slow Horses (2022) [tmdbid-95480]/Season 04/${SLOW.replace(".S04.", `.S04E0${e}.Titel.`)}.mkv`,
          ),
          new: [`Season 04/${SLOW}`],
          exact: true,
          skip: 2,
          choices: ["skip"],
          disks: ["nvme04"],
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
      pkg(
        5,
        WICKED,
        "pending",
        movie(402431, "Wicked", 2024),
        parts(WICKED, 5, 4 * GB, "queued", [{}, {}, {}, {}, { checked: "unknown" }]),
        {
          sources: ["rapidgator.net via Real-Debrid"],
          library: otherMovie(
            "nvme04",
            "Wicked (2024) [tmdbid-402431]",
            "Wicked.2024.German.DL.1080p.WEB.H264-OLD.mkv",
            WICKED,
          ),
        },
      ),
      pkg(6, UNMATCHED, "pending", null, parts(UNMATCHED, 2, 2 * GB, "queued")),
      // Needs attention, failed: a part gone and another that failed for
      // another reason (+1), a wrong archive password.
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
      pkg(8, SUBSTANCE, "failed", movie(933260, "The Substance", 2024), parts(SUBSTANCE, 3, 3 * GB, "done"), {
        error: `${SUBSTANCE.toLowerCase()}.part01.rar: Wrong archive password`,
      }),
      // Failed without a reason: just "Failed".
      pkg(19, TWISTERS, "failed", movie(718821, "Twisters", 2024), parts(TWISTERS, 2, 3 * GB, "done")),
      // Downloading: loading, extracting, waiting (two), paused, and a show
      // started with Skip (the episodes the library has skipped).
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
      pkg(1, DUNE, "queued", movie(693134, "Dune: Part Two", 2024), parts(DUNE, 8, 4 * GB, "queued")),
      pkg(12, ANDOR, "paused", show(83867, "Andor", 2022), parts(ANDOR, 2, 2 * GB, "queued", [{ received: 0.7 * GB }])),
      pkg(
        13,
        TLOU,
        "downloading",
        show(100088, "The Last of Us", 2023),
        episodes(TLOU, 2, 7, 2.4 * GB, "queued", (i) =>
          i < 3
            ? { status: "skipped" }
            : i === 3
              ? { status: "done", received: 2.4 * GB }
              : i === 4
                ? { status: "downloading", received: 0.9 * GB, speed: 41.5e6 }
                : {},
        ),
        {
          choice: "skip",
          library: {
            old: [1, 2, 3].map(
              (e) =>
                `nvme01/shows/The Last of Us (2023) [tmdbid-100088]/Season 02/${TLOU.replace(".S02.", `.S02E0${e}.`)}.mkv`,
            ),
            new: [4, 5, 6, 7].map((e) => `Season 02/S02E0${e}`),
            exact: true,
            skip: 3,
            choices: ["skip"],
            disks: ["nvme01"],
          },
        },
      ),
      // Finished: Ready to organize and Done (above).
      ...finished().map((f) =>
        pkg(f.id, f.name, "done", f.media, [], {
          outputs: f.files.map((file) => ({ path: `${f.name}/${base(file)}`, size: f.bytes / f.files.length })),
          ...(f.moved
            ? {
                movedTo: movedTo(f),
                movedAt: ago(f.moved.minutes),
                movedFiles: f.moved.noFiles ? null : f.files.map((to) => ({ from: `${f.name}/${base(to)}`, to })),
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
      files: f.moved!.noFiles ? [] : f.files,
      bytes: f.bytes,
      replaced: f.moved!.replaced ?? false,
      move: f.moved!.move ?? null,
    }))
    .sort((a, b) => b.movedAt.localeCompare(a.movedAt));
  return { ready: true, libraryDir: "/library", disks, items, moved };
}
