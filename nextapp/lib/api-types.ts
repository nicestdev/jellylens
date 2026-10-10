// What each API route answers, shared by the routes (which check their
// response against it with `satisfies`) and the pages that read it. Types
// only: the imports below are erased, so no server code reaches the
// browser.
import type {
  IgnoreEntry,
  LibraryMovie,
  LibraryShow,
  MismatchEntry,
  MissingCollection,
  MissingEntry,
  Preferences,
  RequestEntry,
} from "./store";
import type { MatchInfo, ReleaseFacets, ReleaseGroup, TitleRelease, TitleRow } from "./store";
import type { TmdbResult } from "./tmdb";
import type { Availability } from "./availability";
import type { FileListRow, FilePart, FileTotals } from "./store";
import type { Unit } from "./upgrades";
import type { DownloadFile, DownloadMedia, DownloadPackage, LibraryCopy } from "./store";
import type { LibraryTarget, MoveProgress, OwnedFile } from "./library-move";
import type { AppEvent } from "./events";

export type { IgnoreEntry, MatchInfo, Preferences, TitleRelease };

// An owned movie or show (its id in the library).
export type LibraryRef = { id: string };

// GET /api/movies — the stored movies without their file names (admins
// only, see /api/collections and /api/analytics).
// Codec: the file's video codec label ("x265"; "" if unknown).
export type MovieItem = Omit<LibraryMovie, "FileName"> & { Codec: string };
export type MoviesResponse = { Items: MovieItem[] };

// How many owned episodes carry each audio language, overall and per season.
export type LanguageCoverage = {
  total: number;
  byLang: Record<string, number>;
  seasons: { season: number; total: number; byLang: Record<string, number> }[];
};

// GET /api/shows — for the TV Shows and Missing pages. Languages: null for
// a show without episodes.
export type ShowItem = LibraryShow & {
  MissingEpisodes: MissingEntry | null;
  Mismatches: MismatchEntry | null;
  Languages: LanguageCoverage | null;
};
export type ShowsResponse = { Items: ShowItem[] };

// GET /api/collections — file names only when the admin turned them on.
// releaseGroups: the favorite groups that have released a part you don't
// own (Releases page), A→Z.
export type CollectionItem = Omit<MissingCollection, "parts"> & {
  id: string;
  name: string;
  posterPath: string | null;
  parts: (MissingCollection["parts"][number] & { releaseGroups: string[] })[];
};
export type CollectionsResponse = { Items: CollectionItem[] };

// GET, POST, DELETE /api/ignored
export type IgnoredResponse = { Items: IgnoreEntry[] };

// GET /api/status — per sync stage: when it last finished, whether it's
// running now, and how its last run failed (null once one succeeds).
export type StageStatus = { syncedAt: string | null; running: boolean; error: string | null };
export type StatusResponse = {
  library: StageStatus & { movies: number; shows: number };
  tmdb: StageStatus & { shows: number; collections: number };
  missing: StageStatus & { incompleteCount: number; incompleteCollectionCount: number; mismatchCount: number };
  releases: StageStatus & { groups: number; releases: number };
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
  archivePasswords: number;
  downloadDir: string;
  intervals: Record<SyncStageName, number>;
  // How many files come in at once (PATCH /api/downloads), up to maxDownloadSlots.
  downloadSlots: number;
  maxDownloadSlots: number;
  // Archive passwords set in Settings, tried in turn before
  // ARCHIVE_PASSWORDS (PATCH /api/downloads).
  passwords: string[];
};

// GET /api/discover — TMDB search or trending, with what's owned.
export type DiscoverItem = TmdbResult & { library: LibraryRef | null; availability: Availability };
export type DiscoverResponse = { Items: DiscoverItem[] };

// GET, POST, DELETE /api/requests. requestedAt: when this user asked (in an
// admin's overview of someone else's: when it was first asked for).
// requesters: admins only. all: the admin overview, everyone's requests.
// releaseGroups: the favorite groups that have released it (Releases page).
// admin: can see those releases (/api/releases), also with sign-in off.
export type RequestItem = Omit<RequestEntry, "requesters"> & {
  mine: boolean;
  library: LibraryRef | null;
  availability: Availability;
  releaseGroups: string[];
  requesters?: { name: string; requestedAt: string }[];
};
export type RequestsResponse = { Items: RequestItem[]; all: boolean; admin: boolean };

// GET /api/releases — one entry per title; library: owned, with its
// poster (TMDB's path).
export type ReleaseTitle = TitleRow & { library: (LibraryRef & { posterPath: string | null }) | null };
export type ReleasesResponse = {
  total: number;
  matched: number;
  Items: ReleaseTitle[];
  facets: ReleaseFacets;
  groups: number;
  syncing: boolean;
};

// GET, POST /api/releases/<key> — a tile's xREL titles, each with its match
// and releases. key: the tile shown now (a decision can move a title to
// another one). label: title and year from its newest release's name.
// head: what the title page shows on top (from the match, else TMDB, else
// a release name); library: owned in Jellyfin, with its poster's tag;
// copies: the library's files of it (a show's, one per episode file).
export type ReleaseDetailTitle = { titleKey: string; label: string; match: MatchInfo; Items: TitleRelease[] };
export type ReleaseHead = {
  title: string;
  year: number | null;
  posterPath: string | null;
  mediaType: "movie" | "tv" | null;
  tmdbId: number | null;
  library: (LibraryRef & { posterPath: string | null }) | null;
  copies: LibraryCopy[];
};
export type { LibraryCopy };
export type ReleaseDetail = { key: string; head: ReleaseHead | null; titles: ReleaseDetailTitle[] };

// GET, POST, DELETE /api/release-groups. syncing: its releases are being
// fetched right now; matching: the sync is checking titles on TMDB.
export type ReleaseGroupItem = ReleaseGroup & { syncing: boolean };
export type ReleaseGroupsResponse = { Items: ReleaseGroupItem[]; matching: boolean };

// Ignore entries by kind, and the shapes inside the Missing page's data.
export type { EpisodeState, IgnoreKind, MissingSeason } from "./store";
export type ShowIgnore = Exclude<IgnoreEntry, { kind: "collection" }>;
export type CollectionIgnore = Extract<IgnoreEntry, { kind: "collection" }>;
export type CollectionPartItem = CollectionItem["parts"][number];

// GET /api/analytics — per library, the totals for the tiles and the share
// chart, from the Jellyfin sync at syncedAt. titles: the movies or shows;
// withFiles: those with files stored; pending: files not stored yet (until
// the next sync). groups, resolutions, codecs: files and bytes per value,
// most files first (group null: files without one; resolution or codec
// "": unknown). languages: per audio language the same, "" for none
// tagged; a file can have several, so these overlap.
export type LibraryAnalytics = FileTotals & {
  titles: number;
  withFiles: number;
  pending: boolean;
  groups: FilePart<string | null>[];
  resolutions: FilePart[];
  codecs: FilePart[];
  languages: FilePart[];
};
export type AnalyticsResponse = { movies: LibraryAnalytics; shows: LibraryAnalytics; syncedAt: string | null };

// GET /api/analytics/files — one page of a library's file list (pageSize
// files at most); matched: how many files the search and filters leave.
export type FilesResponse = { matched: number; pageSize: number; Items: FileListRow[] };
export type { FileListRow, FilePart };

// GET /api/upgrades?library=movies|shows — every owned movie, or season of
// a show, with what the favorite groups have released of it (Upgrades
// page). groups: every release group of the library's files, most files
// first (null: none named). favorites: the favorite groups, in the order
// they were added. sizesPending: a releases sync still has to fill in
// some of their sizes.
export type UpgradesResponse = {
  units: Unit[];
  groups: FilePart<string | null>[];
  favorites: string[];
  sizesPending: boolean;
  syncedAt: string | null;
};
export type { Alternative, Tier, Unit } from "./upgrades";

// GET /api/wcx-search?q=&tmdbId= — WCX detail URL for a release, or null.
export type WcxSearchResponse = { url: string | null };

// GET /api/wcx-releases?tmdbId= — the releases on the entry's WCX page
// (none if it has no page), newest first. group, quality ("1080p") and a
// show's seasons ([1, 1] for S01, [1, 3] for S01-S03, null: none named)
// from its name; size: bytes, null if WCX doesn't say. mirrors: per hoster
// and source, the ones we can fetch first (route: how, as the Downloads
// page says it; null: no account for it). source: where its links come
// from, WCX's plain ones or a hide.cx container's (read through its API),
// or a filecrypt container (a captcha: only opened, for its DLC; links 0,
// not known). offline: WCX's first link is gone at the hoster (WCX keeps a
// re-upload's old links), or a hide.cx container's links aren't all
// online. container: the hide.cx or filecrypt page.
// POST { tmdbId, release, hoster, source } adds the release as a Downloads
// package, from that mirror.
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
  size: number | null;
  createdAt: string | null;
  mirrors: WcxMirror[];
};
export type WcxReleasesResponse = { releases: WcxRelease[] };
export type WcxAddResponse = { packageId: number; name: string; hoster: string };

// GET /api/downloads — every package, newest first, with its files.
// speed: bytes a second while a file comes in; extractPercent: while its
// archives are extracted. ready: a hoster sign-in is set, so links can be fetched.
// inLibrary: an episode the library already has. checked: what the hoster
// said before it's started (lib/download-match.ts): online, unknown (asked,
// no answer), null (not asked yet); an offline one is failed.
export type DownloadFileItem = Omit<DownloadFile, "url" | "packageId"> & {
  url: string;
  speed: number | null;
  inLibrary: boolean;
  checked: "online" | "unknown" | null;
};
// What the library already has of a package: your copies (copyLabel: group ·
// quality · codec · DL), and for a show how many of its episode parts you have, or for
// a season pack how many of that season's episodes. exact: how many of
// those copies are from this very release (fromRelease).
export type DownloadLibrary = {
  have: string[];
  exact: number;
  parts: number;
  partsOwned: number;
  season: { number: number; episodes: number } | null;
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
  // What the library has of it already (it's moved only by Replace or Add
  // as version then).
  owned: OwnedFile[];
  move: MoveProgress | null;
};
// A moved one: files, each one's path in its folder (none known: it can't
// be moved back), bytes (theirs, as they are now); move, while it's moved
// back (Undo).
export type OrganizeMoved = {
  id: number;
  name: string;
  media: DownloadMedia | null;
  movedTo: string;
  movedAt: string;
  files: string[];
  bytes: number;
  // Moved in by Replace: no Undo.
  replaced: boolean;
  move: MoveProgress | null;
};
// GET/POST /api/organize/scan — the library scan: running, and how far its probing is
// (0–100; null while idle).
export type OrganizeScan = { running: boolean; percent: number | null };
export type OrganizeResponse = {
  ready: boolean;
  libraryDir: string;
  disks: OrganizeDisk[];
  items: OrganizeItem[];
  moved: OrganizeMoved[];
};

// GET /api/events — what happened in the background (lib/events.ts) after
// the id asked for, and the last id there is.
export type EventsResponse = { last: number; events: AppEvent[] };
