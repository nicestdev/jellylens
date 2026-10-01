<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jellylens

A dashboard over a Jellyfin library: movies and shows, missing episodes and
collection movies (checked against TMDB), mismatches, per-user requests, and
the releases of favorite P2P and scene groups (from xREL).

## Stack

- Next.js App Router (TypeScript) on Node 24. Backend logic lives in Route
  Handlers under `app/api/**`; there is no separate backend service.
- UI: shadcn/ui components as source in `components/ui/`, built on Base UI
  primitives in this shadcn version (not Radix, despite older examples).
  Tailwind v4, dark only (`<html class="dark">`).
- All state in SQLite: `DATA_DIR/jellylens.db` (default `/app/data`), through
  better-sqlite3. `lib/db.ts` opens it and runs the migrations (one entry per
  schema version, tracked in `PRAGMA user_version`; never edit one that has
  shipped. The first is a baseline that every earlier version was folded
  into on 2026-10-02). Data access is in `lib/store/`, one module per area
  (library, files, tmdb, missing, ignored, requests, preferences, releases,
  posters, sync-state, upgrades), all re-exported by `lib/store/index.ts`; SQL helpers in
  `lib/store/sql.ts`. Every read goes to the database, so a page always sees
  what the last sync wrote; each sync replaces its data in one transaction.
  Jellyfin items are stored with only the fields Jellylens reads
  (`JellyfinMovie`, `JellyfinShow` in `lib/store/library.ts`).
- Route responses are typed in `lib/api-types.ts`, shared by the routes
  (`satisfies`) and the pages.
- Config is env vars only (`lib/env.ts`, read-only on the Settings page),
  except display options (`preferences` table, `PATCH /api/preferences`) and
  the favorite release groups.

## Sync stages

Each has a trigger in `lib/sync-manager.ts` (deduped by `makeTrigger` in
`lib/scheduler.ts`, so a manual "Sync now" racing a scheduled tick never runs
twice; it also remembers whether it's running and its last error) and an
interval env var (`0` = off). `POST /api/sync/<stage>` starts one in the
background and answers 202 right away (a sync can outlast a proxy's
timeout); `GET /api/status` has each stage's last sync, `running` and
`error`, and `runSync()` in `lib/api-client.ts` starts a stage and polls
until it's done. `instrumentation.ts` opens the database at boot, runs
Jellyfin → TMDB (→ missing) and the releases sync, then installs the
intervals.

1. **Jellyfin** (`lib/sync-jellyfin.ts`, stage `jellyfin`,
   `JELLYFIN_SYNC_INTERVAL_HOURS`, default 6): movies, shows and episodes of
   the first admin user (resolved at boot). Movies keep their file's name
   (for matching the release group) but not its path; `/api/movies` leaves
   it out. Every movie's and episode's file goes to `media_files` for
   Analytics (its name and size, audio languages, and the group, resolution
   and codec `storedFiles` in `lib/analytics.ts` reads), in the same
   transaction. Chains a missing
   recheck once TMDB has synced.
2. **TMDB** (`lib/sync-tmdb.ts`, stage `tmdb`,
   `TMDB_SYNC_INTERVAL_HOURS`, default 24): season/episode lists of every
   show matched to TMDB, and every TMDB collection an owned movie belongs to
   (Jellyfin sets `ProviderIds.TmdbCollection`), in Jellyfin's metadata
   language. A show or collection whose request fails keeps the last sync's
   data (a hiccup must not turn into missing episodes or false mismatches);
   only a 404 drops it. Chains a missing recheck.
3. **Missing recheck** (`lib/compute-missing.ts`, stage `missing`,
   `MISSING_RECHECK_INTERVAL_HOURS`, default 24): no network. Pure diffs
   (`ownedEpisodes`, `diffSeries`, `missingCollections`) of the library
   against TMDB: aired episodes not owned (combined files via
   `IndexNumberEnd`), owned episodes/seasons TMDB doesn't know (mismatches;
   specials excluded), and collection parts not owned that are out on disc
   or digital (same rules as the Requests page, `movieAvailability` in
   `lib/availability.ts`).
4. **Releases** (`lib/sync-releases.ts`, stage `releases`,
   `XREL_SYNC_INTERVAL_HOURS`, default 6), see below.

## Releases (xREL)

Admins add favorite groups in Settings (`app/settings/release-groups.tsx`,
`/api/release-groups`), a list each for P2P and scene; both live in
`release_groups` (`kind`) and their releases in `releases`. xREL's API
(`lib/xrel.ts`, no key) has no group lookup, so a P2P name is resolved by
searching P2P releases for `-NAME` (the API id is the group's), a scene
name by searching scene releases for `NAME` (no API id: stored as
`scene:NAME`); a name of the other kind gets a message pointing to the
other list. xREL allows 900 calls an hour: the client reads
`x-ratelimit-*` and a sync stops with 10 left; searches are spaced 2.5 s
apart.

One sync does both kinds. A P2P group's first sync walks its whole list
(100 per page); later ones stop at the first page with a release already
stored. A scene group has no list on the API, only that search, which
finds its latest releases (about 50): each sync adds what's new, so older
ones pile up from when the group was added, and earlier ones never come
in. Scene releases carry no resolution category, so their quality is read
from the name (`sceneQuality`), in the P2P categories' terms.

Releases belong to xREL titles (`title_key`); a movie's are split further
by the year in their names (`e1~1995`, `toRelease` in `lib/xrel.ts`), since
xREL now and then files a remake under the original. xREL also sometimes links a release to the
wrong movie, so its IMDb id's TMDB entry (`imdb_lookups`) is
only a candidate: `decideMatch` in `lib/title-match.ts` checks it against the
release names (title by TMDB's localized, original or other titles, year ±1,
±3 for the very same title), falls back to a TMDB search by the name's title
and year, and otherwise shows the name's own title with nothing from TMDB.
The result is `title_matches` (status verified / searched / unverified, or
confirmed / rejected by hand from the title's panel, kept in
`match_overrides`). The page, its search (`r.search` for names, `t.search`
for checked titles) and "In library" read only from `title_matches`, never
xREL's own title.

The page shows one tile per TMDB entry (key `movie:949`), since one movie
can end up as several titles; a title matched to nothing is a tile of its
own (key: its `title_key`). `GET /api/releases` searches, filters (group,
quality, type), sorts and pages tiles in SQL, nothing cached; the filter
menu lists its values without counts, which would mean another scan of
every release. `GET /api/releases/<key>` gives a tile's titles with their
releases and matches (the panel, `components/release-panel.tsx`, which
the posters on Requests and Missing open too, for admins); `POST`
takes a decision about one of them (`titleKey`) and answers with the tile,
or the title's new one if it was the tile's last. In the panel a show's
single episodes are one line per season, group and version
(`groupEpisodes` in `lib/release-labels.ts`). Its WCX link
(`GET /api/wcx-search?tmdbId=`) searches WCX by the entry's IMDb id (from
`imdb_lookups`, else TMDB's external ids); `wcx` keeps a hit for good and
a miss for an hour, so reopening a panel asks nobody.

## Images

The browser never talks to Jellyfin or TMDB directly. Jellyfin posters go
through `GET /api/image/<id>` (`lib/image-cache.ts`, `DATA_DIR/images`, pruned
after each Jellyfin sync); TMDB posters through `GET /api/tmdb-image/<size>/<file>`
(`lib/tmdb-image-cache.ts`, `DATA_DIR/tmdb-images`; build URLs with
`tmdbImage()` in `lib/api-client.ts`). Unreferenced TMDB posters are pruned
after a month (`tmdbPosterPaths()` in `lib/store/posters.ts` lists the
referenced ones). Titles link to TMDB (`tmdbUrl()`), never to Jellyfin. The
CSP in `next.config.ts` allows images and fonts only from Jellylens itself,
so a new image source has to go through a route like these.

## Sign-in

`proxy.ts` gates every page and `/api/*` route except `/login` and
`/api/auth/*`. Users sign in with their Jellyfin username and password,
checked once via `/Users/AuthenticateByName` (the Jellyfin token is signed
out right away); Jellylens keeps its own HMAC-signed cookie (`lib/session.ts`,
7 days, secret in `DATA_DIR/session-secret`), re-checked against Jellyfin's
user list (cached a minute) on every request. Failed sign-ins are limited per
IP and per username (`lib/rate-limit.ts`, 5 per 15 min). `proxy.ts` also
rejects state changes with a cross-site `Sec-Fetch-Site`; `next.config.ts`
sets the security headers. Jellyfin admins get Missing, Releases, Analytics,
Upgrades, Settings and the sync/ignore/config APIs (`ADMIN_ONLY`); everyone gets Movies, TV
Shows and their own Requests. Server code reads the user with `currentUser()`
(`lib/auth.ts`). `AUTH_ENABLED=false` turns it all off: everyone is
`LOCAL_USER`, an admin, and requests are one shared list.

Requests are one entry per title (`requests`) with everyone who asked
(`requesters`); admins see everyone's, most wanted first. Each request
lists the favorite groups that have released it (`groupsByTile` in
`lib/store/releases.ts`, by TMDB entry; Missing's collection movies you
don't own say the same, `/api/collections`), and Releases tiles matched to TMDB
can be requested from the grid (`RequestAction` in
`components/request-tiles.tsx`).

## Pages

Client components under `app/` that fetch from the routes above. Page data
loads through `useLoad` (`hooks/use-load.ts`: load on mount, `reload()`,
`setData()` after a change the server answered); `usePoll`
(`hooks/use-poll.ts`) reloads on an interval, skipping hidden tabs.
Settings loads its status, config, preferences and groups together and
polls them every 2 s while a sync runs, every 15 s otherwise. What a page
works out from that data (filtering, sorting, counts, tile texts) is plain functions in its
`logic.ts` next to it, tested without React; shared helpers are in
`lib/facets.ts` (filter and sort) and `lib/format.ts` (plurals, numbers and
dates German-style, relative times). Shared UI: `poster-card`
(grid tile with corner badges, link or button), `filter-menu` (multi-select
sections, or `single` ones that always have one picked), `sort-menu`,
`search-input`, `empty-state`, `stat-tile` (a number with a label and hint;
a button that picks a category on Missing). Missing has a Movies and a TV Shows tab like
Analytics, with one card per category (`app/missing/`): collection movies,
and missing episodes (gaps in finished seasons), missing seasons, currently
airing and mismatches; ignore entries are
`{ kind: "missing" | "mismatch", seriesId, season }` or
`{ kind: "collection", collectionId, movieId }` (`null` = all of it).
Analytics (`app/analytics/`) has a tab each for the movies' and the
episodes' files (`library=movies|shows`): `GET /api/analytics` has both
libraries' totals for the tiles and the share charts (files and storage by
group, files by resolution and by codec as donuts, and by audio language as
radial bars, a ring each for German, English and Spanish out of every
file, since a file can have several; in a sideways carousel), and
`GET /api/analytics/files` searches, filters, sorts and pages a library's
file list in SQL (`lib/store/files.ts`), like the Releases page, since a
show library has tens of thousands. The donuts count files, not titles, so
their parts add up to the whole; clicking a piece sets the file list's
filter for its dimension. `releaseGroupOf` reads the group from the end of
a scene-style or Sonarr/Radarr name, from the front of a lowercase scene
short name ("pl3x-heman.s01e01"), or else from the file's folder (season
packs); files without one are "n/a".

Upgrades (`app/upgrades/`) compares the files with the favorite groups'
releases, a Movies and a TV Shows tab again. `GET /api/upgrades?library=`
has every owned movie, or season of a show, as a unit (`lib/upgrades.ts`:
its files' groups, quality, codec, audio and size) with what each favorite
group has of it (by TMDB entry through `title_matches`): a movie's
releases, a season's pack or all of its owned episodes one by one
(`episodesOf` reads `S01`, `S01E02`; a group with only some has nothing
to offer), per quality and codec, with xREL's size (`releases.size_mb`,
filled in for releases stored before by every group walking its list once
more) and DL/ML, quality and codec from the name. Nothing is stored: each
request works it out anew, so a Jellyfin sync that sees a swapped file
takes it off the list. The page adds it up itself (`app/upgrades/logic.ts`),
so the filter needs no request: a target group (the one to switch to),
quality and codec, one of each and remembered per library in the browser;
source groups (what you have now) and "adds original audio". Each row is
what changes (group, quality, codec, audio as from → to chips), with the
sizes and the change in storage; the tiles add it up, and the title opens
the release panel on just the target's releases in that quality, codec
and season (its `only`). Only favorites can be picked, P2P or scene; a
scene group rarely has a whole season (no packs, and only its latest
releases), so for shows it seldom has anything to offer.

## Development

`docker compose -f docker-compose.dev.yml up -d` runs `next dev` in a
container on http://localhost:8081, with `nextapp/` bind-mounted; it reloads
on save, so there's no need to restart the container after an edit (only
after changing `next.config.ts`, the env or `package.json`). Type checks,
lint and tests run in the container (`docker compose -f
docker-compose.dev.yml exec media-overview npm run typecheck`, `… npm run
lint`, `… npm test`).

## Tests

Vitest (`vitest.config.mts`, `npm test`), next to the code as `*.test.ts(x)`.
`test/setup.ts` gives every test a fresh in-memory database, fails any fetch
a test didn't mock (`mockFetch` in `test/http.ts`), and drops server state
kept on `globalThis` (`test/state.ts`). Modules keep such state (rate limits,
caches, queues) on `globalThis` and look it up on every use, never capture
it at import, so that reset works; add new keys to `test/state.ts`. Stored
library items for tests come from `test/fixtures.ts`. Components and hooks
are tested with Testing Library in happy-dom (`*.test.tsx`, or a hook's
`*.test.ts`, starting with `// @vitest-environment happy-dom` and importing
`test/dom.ts`); pages keep their logic in `logic.ts` and interactive parts
in components of their own (a page file may only export the page). CI
(`.github/workflows/docker.yml`) runs lint, `npm run typecheck` (which runs
`next typegen` first) and the tests before building the image.

## Dependencies

npm 11's `allowScripts` in `package.json` denies install scripts not
reviewed: better-sqlite3 ships prebuilt binaries for every platform we build
(its implicit `node-gyp rebuild` would only need a compiler), and
unrs-resolver's postinstall only fetches a binding npm already installs. A
new dependency with an install script shows up in `npm install-scripts ls`;
allow it only if it really builds something.

## Working with shadcn components

Add new components with `npx shadcn@latest add <name>` rather than hand-writing
them — this version's primitives (`@base-ui/react`, not Radix) and APIs may not
match older shadcn examples. Check `ui.shadcn.com/llms.txt` or the installed
component's own source in `components/ui/` before assuming an API.
