// What each API route answers, shared by the routes (which check their
// response against it with `satisfies`) and the pages that read it. Types
// only: the imports below are erased, so no server code reaches the
// browser.
import type {
  IgnoreEntry,
  JellyfinMovie,
  JellyfinShow,
  MismatchEntry,
  MissingCollection,
  MissingEntry,
  Preferences,
  RequestEntry,
} from "./store";
import type { MatchInfo, ReleaseFacets, ReleaseGroup, TitleRelease, TitleRow } from "./store";
import type { TmdbResult } from "./tmdb";
import type { Availability } from "./availability";

export type { IgnoreEntry, MatchInfo, Preferences, TitleRelease };

// An owned movie or show in Jellyfin, for linking to it.
export type LibraryRef = { id: string; serverId: string };

// GET /api/movies — the stored movies without their file names (admins
// only, see /api/collections).
export type MovieItem = Omit<JellyfinMovie, "FileName">;
export type MoviesResponse = { Items: MovieItem[] };

// How many owned episodes carry each audio language, overall and per season.
export type LanguageCoverage = {
  total: number;
  byLang: Record<string, number>;
  seasons: { season: number; total: number; byLang: Record<string, number> }[];
};

// GET /api/shows — for the TV Shows and Missing pages. Languages: null for
// a show without episodes.
export type ShowItem = JellyfinShow & {
  MissingEpisodes: MissingEntry | null;
  Mismatches: MismatchEntry | null;
  Languages: LanguageCoverage | null;
};
export type ShowsResponse = { Items: ShowItem[] };

// GET /api/collections — file names only when the admin turned them on.
export type CollectionItem = MissingCollection & { id: string; name: string; posterPath: string | null };
export type CollectionsResponse = { Items: CollectionItem[] };

// GET, POST, DELETE /api/ignored
export type IgnoredResponse = { Items: IgnoreEntry[] };

// GET /api/status — per sync stage: when it last finished, whether it's
// running now, and how its last run failed (null once one succeeds).
export type StageStatus = { syncedAt: string | null; running: boolean; error: string | null };
export type StatusResponse = {
  jellyfin: StageStatus & { movies: number; shows: number };
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
  authEnabled: boolean;
  intervals: Record<SyncStageName, number>;
};

// GET /api/discover — TMDB search or trending, with what's owned.
export type DiscoverItem = TmdbResult & { library: LibraryRef | null; availability: Availability };
export type DiscoverResponse = { Items: DiscoverItem[] };

// GET, POST, DELETE /api/requests. requestedAt: when this user asked (in an
// admin's overview of someone else's: when it was first asked for).
// requesters: admins only. all: the admin overview, everyone's requests.
// releaseGroups: the favorite groups that have released it (Releases page).
export type RequestItem = Omit<RequestEntry, "requesters"> & {
  mine: boolean;
  library: LibraryRef | null;
  availability: Availability;
  releaseGroups: string[];
  requesters?: { name: string; requestedAt: string }[];
};
export type RequestsResponse = { Items: RequestItem[]; all: boolean };

// GET /api/releases — one entry per title; library: owned in Jellyfin, with
// its poster's tag.
export type ReleaseTitle = TitleRow & { library: (LibraryRef & { imageTag: string | null }) | null };
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
export type ReleaseDetailTitle = { titleKey: string; label: string; match: MatchInfo; Items: TitleRelease[] };
export type ReleaseDetail = { key: string; titles: ReleaseDetailTitle[] };

// GET, POST, DELETE /api/release-groups. syncing: its releases are being
// fetched right now.
export type ReleaseGroupItem = ReleaseGroup & { syncing: boolean };
export type ReleaseGroupsResponse = { Items: ReleaseGroupItem[] };

// Ignore entries by kind, and the shapes inside the Missing page's data.
export type { EpisodeState, IgnoreKind, MissingSeason } from "./store";
export type ShowIgnore = Exclude<IgnoreEntry, { kind: "collection" }>;
export type CollectionIgnore = Extract<IgnoreEntry, { kind: "collection" }>;
export type CollectionPartItem = CollectionItem["parts"][number];
