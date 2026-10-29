// What each API route answers, shared by the routes (which check their
// response against it with `satisfies`) and the pages that read it. Types
// only: the imports below are erased, so no server code reaches the
// browser.
import type { IgnoreEntry, LibraryMovie, LibraryShow, MissingEntry, Preferences, RequestEntry } from "./store";
import type { MatchInfo, ReleaseFacets, ReleaseGroup, TitleRelease, TitleRow } from "./store";
import type { TmdbResult } from "./tmdb";
import type { Availability } from "./availability";
import type { AudioMix, FilePart, LibraryTotals, QualityCell } from "./store";
import type { DownloadFile, DownloadMedia, DownloadPackage, LibraryChoice, LibraryCopy } from "./store";
import type { DloadUser, LogEntry, LogLevel, MigrationRow } from "./store";
export type { LogEntry, LogLevel, MigrationRow };
export type { LibraryChoice };
import type { SeasonAiring } from "./tmdb";
import type { LibraryTarget, MoveProgress, OwnedFile } from "./library-move";
import type { AppEvent } from "./events";

export type { IgnoreEntry, MatchInfo, Preferences, TitleRelease };

// An owned movie or show (its id in the library).
export type LibraryRef = { id: string };

// GET /api/movies — the stored movies without their file names (admins
// only, see /api/analytics).
// codec: the file's video codec label ("x265"; "" if unknown).
export type MovieItem = Omit<LibraryMovie, "fileName"> & { codec: string };
export type MoviesResponse = { items: MovieItem[] };

// How many owned episodes carry each audio language, overall and per season.
export type LanguageCoverage = {
  total: number;
  byLang: Record<string, number>;
  seasons: { season: number; total: number; byLang: Record<string, number> }[];
};

// GET /api/shows — for Shows and the Dashboard. languages: null for
// a show without episodes.
export type ShowItem = LibraryShow & {
  missingEpisodes: MissingEntry | null;
  languages: LanguageCoverage | null;
};
export type ShowsResponse = { items: ShowItem[] };

// GET, POST, DELETE /api/ignored
export type IgnoredResponse = { items: IgnoreEntry[] };

// GET /api/status — per sync stage: when it last finished, whether it's
// running now, and how its last run failed (null once one succeeds).
export type StageStatus = { syncedAt: string | null; running: boolean; error: string | null };
export type StatusResponse = {
  library: StageStatus & { movies: number; shows: number };
  tmdb: StageStatus & { movies: number; shows: number };
  releases: StageStatus & { groups: number; releases: number };
  wcx: StageStatus & { releases: number };
  dload: StageStatus & { threads: number };
};
export type SyncStageName = keyof StatusResponse;

// GET /api/config — masked keys and the schedule, for the Settings page.
export type ConfigResponse = {
  jellyfinUrl: string;
  jellyfinApiKey: string;
  tmdbApiKey: string;
  tmdbLanguage: string;
  authEnabled: boolean;
  ddownloadLogin: string;
  ddownloadPassword: string;
  realDebridToken: string;
  dloadUser: string;
  dloadPassword: string;
  archivePasswords: number;
  // How many groups P2P_GROUPS and SCENE_GROUPS name (added at every start
  // if missing; the group tables list them).
  p2pGroups: number;
  sceneGroups: number;
  downloadDir: string;
  intervals: Record<SyncStageName, number>;
  // How many files come in at once (PATCH /api/downloads), up to maxDownloadSlots.
  downloadSlots: number;
  maxDownloadSlots: number;
  // Archive passwords set in Settings, tried in turn before
  // ARCHIVE_PASSWORDS (PATCH /api/downloads).
  passwords: string[];
  // A finished package goes into the library on its own (PATCH /api/downloads).
  autoMove: boolean;
};

// GET /api/discover — TMDB search or trending, with what's owned.
export type DiscoverItem = TmdbResult & { library: LibraryRef | null; availability: Availability };
export type DiscoverResponse = { items: DiscoverItem[] };

// GET, POST, DELETE /api/requests. requestedAt: when this user asked (in an
// admin's overview of someone else's: when it was first asked for).
// requesters: admins only. all: the admin overview, everyone's requests.
// admin: can see those releases (/api/releases), also with sign-in off.
export type RequestItem = Omit<RequestEntry, "requesters"> & {
  mine: boolean;
  library: LibraryRef | null;
  availability: Availability;
  requesters?: { name: string; requestedAt: string }[];
};
export type RequestsResponse = { items: RequestItem[]; all: boolean; admin: boolean };

// GET /api/releases — one entry per title; library: owned, with its
// poster (TMDB's path).
export type ReleaseTitle = TitleRow & { library: (LibraryRef & { posterPath: string | null }) | null };
export type ReleasesResponse = {
  total: number;
  matched: number;
  items: ReleaseTitle[];
  facets: ReleaseFacets;
  favoriteGroups: number; // how many of facets.group are favorites (they come first)
  groups: number;
  syncing: boolean;
};

// GET, POST /api/releases/<key> — a tile's xREL titles, each with its match
// and releases. key: the tile shown now (a decision can move a title to
// another one). label: title and year from its newest release's name.
// head: what the title page shows on top (from the match, else TMDB, else
// a release name); library: owned, with its poster (TMDB's path);
// copies: the library's files of it (a show's, one per episode file).
export type ReleaseDetailTitle = { titleKey: string; label: string; match: MatchInfo; items: TitleRelease[] };
export type ReleaseHead = {
  title: string;
  year: number | null;
  posterPath: string | null;
  mediaType: "movie" | "tv" | null;
  tmdbId: number | null;
  library: (LibraryRef & { posterPath: string | null }) | null;
  copies: LibraryCopy[];
  aired: Record<number, SeasonAiring> | null; // a show's aired (and known) episodes per season, TMDB's
};
export type { LibraryCopy, SeasonAiring };
// GET /api/releases/movie:<id>/collection: a movie's TMDB collection, every
// part, their titles without what most of them share; null without one.
export type CollectionResponse = { collection: { name: string; items: DiscoverItem[] } | null };
// resolutions: every quality the tile's releases have, with their names (all of them, however `?resolution=` narrows `titles`).
// dload: the DLoad uploaders' threads of the title (a TMDB entry's), its
// name as a release's, its uploader's group, its page, when it was opened
// (unix seconds).
export type DloadThread = { id: number; name: string; group: string; url: string; postedAt: number };
export type ReleaseDetail = {
  key: string;
  head: ReleaseHead | null;
  titles: ReleaseDetailTitle[];
  resolutions: Record<string, string[]>;
  dload: DloadThread[];
};

// GET, POST, DELETE /api/release-groups. syncing: its releases are being
// fetched right now; matching: the sync is checking titles on TMDB.
export type ReleaseGroupItem = ReleaseGroup & { syncing: boolean };
export type ReleaseGroupsResponse = { items: ReleaseGroupItem[]; matching: boolean };

// GET, POST, DELETE /api/dload-users: the DLoad uploaders whose threads
// are read, each with the group most of them are of and how many we know.
export type DloadUsersResponse = { items: DloadUser[] };

// A missing season as the Dashboard shows it.
export type { MissingSeason } from "./store";

// GET /api/analytics — from the library scan at syncedAt: per library the
// totals for the tiles (LibraryTotals), and over both the files and bytes
// per resolution, codec, audio mix and release group, largest first
// (group null: files without one; resolution or codec "": unknown), and
// per resolution and codec together (quality).
export type AnalyticsResponse = {
  movies: LibraryTotals;
  shows: LibraryTotals;
  resolutions: FilePart[];
  codecs: FilePart[];
  quality: QualityCell[];
  audio: FilePart<AudioMix>[];
  groups: FilePart<string | null>[];
};

export type { AudioMix, FilePart, QualityCell };

// GET /api/wcx-search?q=&tmdbId= — WCX detail URL for a release, or null.
export type WcxSearchResponse = { url: string | null };

// GET /api/wcx-releases?tmdbId= — the releases on the entry's WCX page
// (none if it has no page), newest first. group, quality ("1080p") and a
// show's seasons ([1, 1] for S01, [1, 3] for S01-S03, null: none named)
// from its name; size: bytes, null if WCX doesn't say. mirrors: per hoster
// and source, in the order they're taken (lib/mirrors.ts; route: how, as
// the Queue says it; null: no account for it, or for a hide.cx
// container without plain WCX links, not known until its links are read). source: where its links come
// from, WCX's plain ones or a hide.cx container's (read through its API),
// or a filecrypt container (a captcha: only opened, for its DLC; links 0,
// not known). offline: WCX's first link is gone at the hoster (WCX keeps a
// re-upload's old links), or a hide.cx container's links aren't all
// online (set only where a mirror was checked). container: the hide.cx or
// filecrypt page.
// POST { tmdbId, releases } (Check) tries one release's mirrors in order:
// the first online one is added to Downloads, else a filecrypt container
// to open (captcha), else none.
export type WcxSource = "wcx" | "hide.cx" | "filecrypt";
export type WcxMirror = {
  hoster: string;
  source: WcxSource;
  links: number;
  route: string | null;
  offline: boolean;
  container: string | null;
};
export type WcxRelease = {
  uid: string;
  name: string;
  group: string | null;
  quality: string | null;
  seasons: [number, number] | null;
  seasonEpisodes: number | null; // how many episodes of its season it holds, as WCX says
  size: number | null;
  createdAt: string | null;
  mirrors: WcxMirror[];
};
// resolutions: as in ReleaseDetail.
export type WcxReleasesResponse = { releases: WcxRelease[]; resolutions: Record<string, string[]> };
export type WcxAddResponse =
  // started: downloading right away; else it waits in Needs attention.
  | { result: "added"; packageId: number; name: string; started: boolean; hoster: string; source: WcxSource }
  | { result: "captcha"; url: string; hoster: string }
  | { result: "none" };

// GET /api/downloads — every package, newest first, with its files.
// speed: bytes a second while a file comes in; extractPercent: while its
// archives are extracted. ready: a hoster sign-in is set, so links can be fetched.
// checked: what the hoster
// said before it's started (lib/download-match.ts): online, unknown (asked,
// no answer), null (not asked yet); an offline one is failed.
export type DownloadFileItem = Omit<DownloadFile, "url" | "packageId" | "innerName"> & {
  url: string;
  speed: number | null;
  checked: "online" | "unknown" | null;
};
// What the library already has of a new package, as Needs attention shows
// it (a tree like Organize's): old, those files (paths under LIBRARY_DIR,
// the disk first), what a Replace takes out; new, what comes, a movie's
// release name, a show's episodes by season folder ("Season 01/S01E03"),
// a pack in one archive its name ("Season 01/Show.S01.…-GRP"). exact:
// they're from this very release (a pack is all one or the other). skip:
// how many of its episodes the library has (a movie: 1). choices: what
// Start can do about it, Replace when they're another version, Skip when
// they're this one and something's left to fetch (a pack in one archive
// comes whole, so it may always skip); none: only Remove. disks: where
// the old files are ("nvme02"), in disk order.
export type DownloadLibrary = {
  old: string[];
  new: string[];
  exact: boolean;
  skip: number;
  choices: LibraryChoice[];
  disks: string[];
  // Of old, the files only assumed to be from this release: a show's other
  // episodes once the first one's archive proved it (not proven: lib/archive-peek.ts).
  presumed: string[];
};
// sources: where an unfinished one's files come from ("ddownload",
// "rapidgator.net via Real-Debrid", "no account"). outputs: a finished
// one's files on disk (its size; Organize moves them).
export type DownloadPackageItem = DownloadPackage & {
  library: DownloadLibrary | null;
  sources: string[];
  outputs: { path: string; size: number }[];
  extractPercent: number | null;
  files: DownloadFileItem[];
};
// slots: how many files come in at once (lib/store/downloads.ts), up to
// maxSlots.
export type DownloadsResponse = {
  ready: boolean;
  downloadDir: string;
  freeBytes: number | null;
  slots: number;
  maxSlots: number;
  packages: DownloadPackageItem[];
};

// GET /api/organize — finished downloads to move into the library, the
// library's disks, and what was moved (newest first). ready: LIBRARY_DIR
// is set and readable. An item's folder: the title's folder name ("Name
// (Year) [tmdbid-N]", lib/library-names.ts); files: each file's path in it
// (a show's in Season NN/); targets: its kind's folder on each disk
// (existing: the title's folder there, if any); move: while it waits,
// runs, or after it failed.
export type OrganizeDisk = { disk: string; freeBytes: number | null; totalBytes: number | null };
export type OrganizeItem = {
  id: number;
  name: string;
  media: DownloadMedia | null;
  folder: string;
  files: string[];
  bytes: number;
  error: string | null;
  targets: LibraryTarget[];
  // What the library has of it already (it's moved only by Replace then).
  owned: OwnedFile[];
  move: MoveProgress | null;
};
// A moved one: files, each one's path in its folder, bytes (theirs, as
// they are now).
export type OrganizeMoved = {
  id: number;
  name: string;
  media: DownloadMedia | null;
  movedTo: string;
  movedAt: string;
  files: string[];
  bytes: number;
  // Moved in by Replace.
  replaced: boolean;
};
export type OrganizeResponse = {
  ready: boolean;
  libraryDir: string;
  disks: OrganizeDisk[];
  items: OrganizeItem[];
  moved: OrganizeMoved[];
};

// GET /api/events — what happened in the background (lib/events.ts) after
// the id asked for, and the last id there is; boot: the server's run the
// ids are from.
export type EventsResponse = { boot: string; last: number; events: AppEvent[] };

// GET /api/logs — the log (lib/log.ts), newest first, a page at a time;
// more: there are older ones.
export type LogsResponse = { entries: LogEntry[]; more: boolean };

// GET /api/migrations — every target's (the DLoad uploaders' groups, then
// the favorite P2P groups, `targets` by name) rows: the library's movies
// and seasons it offers, from anyone else (replace) or its own WEB it has a
// BluRay of (upgrade). dload: whether the DLoad sync runs, and how it last
// failed.
export type MigrationsResponse = {
  rows: MigrationRow[];
  targets: string[];
  dload: Omit<StageStatus, "syncedAt">;
};
