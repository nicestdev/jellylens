<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Jellylens

A dashboard over a media library on disk, played with Jellyfin: movies and
shows, missing episodes (checked against TMDB), what comes in through the
download queue, per-user requests, and the releases of favorite P2P and scene
groups (from xREL). The library is read from the disks themselves
(`LIBRARY_DIR`); Jellyfin is only asked for sign-in and to rescan after a
move into the library.

## Stack

- Next.js App Router (TypeScript) on Node 24. Backend logic lives in Route
  Handlers under `app/api/**`; there is no separate backend service.
- UI: shadcn/ui components as source in `components/ui/`, built on Base UI
  primitives in this shadcn version (not Radix, despite older examples).
  Tailwind v4, dark only (`<html class="dark">`).
- All state in SQLite: `DATA_DIR/jellylens.db` (default `/app/data`), through
  better-sqlite3. `lib/db.ts` opens it and runs the migrations (one entry per
  schema version, tracked in `PRAGMA user_version`, also run on the open
  connection when a `next dev` reload brings a new one; never edit one that has
  shipped, add a new one). Data access is in `lib/store/`, one module per area
  (library, files, tmdb, missing, ignored, requests, preferences, releases,
  posters, sync-state, downloads, scan), all re-exported by `lib/store/index.ts`; SQL helpers in
  `lib/store/sql.ts`. Every read goes to the database, so a page always sees
  what the last sync wrote; each sync replaces its data in one transaction.
  Library items are stored with only the fields Jellylens reads
  (`LibraryMovie`, `LibraryShow` in `lib/store/library.ts`).
- Route responses are typed in `lib/api-types.ts`, shared by the routes
  (`satisfies`) and the pages.
- Config is env vars only (`lib/env.ts`, read-only on the Settings page),
  except display options (`preferences` table, `PATCH /api/preferences`),
  the favorite release groups (also `P2P_GROUPS`/`SCENE_GROUPS`, see
  Releases), and the download queue's slots and archive passwords (`download_settings`, `PATCH /api/downloads`).

## Sync stages

Each has a trigger in `lib/sync-manager.ts` (deduped by `makeTrigger` in
`lib/scheduler.ts`, so a manual "Sync" racing a scheduled tick never runs
twice; it also remembers whether it's running and its last error; its
`fresh()` doesn't join a run under way but follows it with one more, for
a caller that just changed what it reads, the rescan after a move) and an
interval env var (`0` = off). `POST /api/sync/<stage>` starts one in the
background and answers 202 right away (a sync can outlast a proxy's
timeout); `GET /api/status` has each stage's last sync, `running` and
`error`, and `runSync()` in `lib/api-client.ts` starts a stage and polls
until it's done. A stage started that way (`startByHand`) leaves no note
once it's done (it was asked for and is seen running); any failed run,
scheduled or not, leaves one (see Notes).
`instrumentation.ts` opens the database at boot, runs library scan → TMDB
(→ missing) and the releases sync, then installs the intervals.

1. **Library scan** (`lib/library-scan.ts`, stage `library`,
   `LIBRARY_SCAN_INTERVAL_HOURS`, default 6): `LIBRARY_DIR`'s disks, each
   with `movies/` and `shows/`, a folder per title named "Name (Year)
   [tmdbid-N]" (as a move from the Queue names them). A movie's and a show's id is its
   TMDB id; a title on several disks is one (`disks`), a folder without a
   video or without a TMDB id is left out (the latter logged). A show's
   episodes come from `SxxEyy` / `SxxEyy-Ezz` in their names, one episode
   (`<show>:<season>:<episode>`) per number with every file of it a
   version; extras (Jellyfin's folder names and suffixes, samples) don't
   count. Every video is probed with ffprobe (`lib/ffprobe.ts`: length,
   video codec and size, audio languages), kept in `probes` until its size
   or mtime changes, so only the first scan takes long (about 0.1 s a file
   over sshfs). TMDB's details (name, genres, poster,
   a show's status; `fetchTmdbDetails`) are asked for once per new title and
   kept in `tmdb_details`; without a TMDB key titles go by their folder.
   Movies keep their file's name (for matching the release group);
   `/api/movies` leaves it out. Every movie's and episode's file goes to
   `media_files` for Analytics (its name, path under `LIBRARY_DIR` and size,
   audio languages, and the group, resolution and codec `storedFiles` in
   `lib/analytics.ts` reads), in the same transaction. `scanProgress()` says
   how far it is (`/api/organize/scan`). Then the requests the library has
   now are dropped (`dropFulfilledRequests` in `lib/store/requests.ts`), and
   once TMDB has synced, the shows new since that sync get their seasons
   (`syncNewTmdb` in `lib/sync-tmdb.ts`, one that
   fails left for the next TMDB sync) before the incomplete shows are
   worked out (see below).
2. **TMDB** (`lib/sync-tmdb.ts`, stage `tmdb`,
   `TMDB_SYNC_INTERVAL_HOURS`, default 24): every library title's details
   again (`refreshDetails`, written into the stored titles: a show ends, a
   poster changes), then season/episode lists of every show, all in
   `TMDB_LANGUAGE` (also what every other TMDB request uses). A show whose
   request fails keeps the last sync's
   data (a hiccup must not turn into missing episodes);
   only a 404 drops it. Then the incomplete shows are worked out again,
   which is also what catches episodes that aired since the last run.
3. **Releases** (`lib/sync-releases.ts`, stage `releases`,
   `XREL_SYNC_INTERVAL_HOURS`, default 6), see below.

The incomplete shows (`computeMissing` in `lib/compute-missing.ts`, the
Dashboard's Incomplete shows) are no stage of their own: the last step of
every library scan (once TMDB has synced) and every TMDB sync, no network.
Pure diffs (`ownedEpisodes`, `diffShow`) of the library against TMDB:
aired episodes not owned (combined files via `episodeEnd`).

## Releases (xREL)

Admins add favorite groups in Settings (`app/settings/release-groups.tsx`,
`/api/release-groups`), a list each for P2P and scene; both live in
`release_groups` (`kind`) and their releases in `releases`. xREL's API
(`lib/xrel.ts`, no key) has no group lookup, so a P2P name is resolved by
searching P2P releases for `-NAME` (the API id is the group's), a scene
name by searching scene releases for `NAME` (no API id: stored as
`scene:NAME`; `findGroupOf` in `lib/release-groups.ts`); a name of the
other kind gets a message pointing to the other list. `P2P_GROUPS` and
`SCENE_GROUPS` (comma-separated) are added the same way at the start of
every releases sync when the database doesn't have them yet
(`addEnvGroups`; one xREL doesn't list is logged), so a new database comes
with them and one missed because xREL was out of calls comes in with a
later sync; one removed on Settings is back after the next sync while the
variable names it. xREL allows 900 calls an hour: the client reads
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
xREL now and then files a remake under the original; on a tile (where its
parts matched the same entry anyway, often only a group's year a year off)
the title page shows them as one again, without a year, a decision going
for all of them. xREL also sometimes links a release to the
wrong movie, so its IMDb id's TMDB entry (`imdb_lookups`) is
only a candidate: `decideMatch` in `lib/title-match.ts` checks it against the
release names (title by TMDB's localized, original or other titles, year ±1,
±3 for the very same title), falls back to a TMDB search by the name's title
and year, and otherwise shows the name's own title with nothing from TMDB.
The result is `title_matches` (status verified / searched / unverified, or
confirmed / rejected by hand from the title page's ⋯ menu, kept in
`match_overrides`). Discover's releases, their search (`r.search` for names, `t.search`
for checked titles) and "In library" read only from `title_matches`, never
xREL's own title.

Discover shows admins the releases as one tile per TMDB entry (key `movie:949`;
`app/discover/page.tsx`, its request and filter menus in
`app/discover/releases.ts`), since one movie can end up as several titles; a title matched to nothing is a tile of its
own (key: its `title_key`). `GET /api/releases` searches, filters (by
xREL's type, movie or show, and by group), sorts and pages tiles in SQL, nothing cached; the filter
menu lists its values without counts, which would mean another scan of
every release. `GET /api/releases/<key>` gives a tile's titles with their
releases and matches (the title page, `app/title/[kind]/[id]` with
`components/title-view.tsx`, which the titles on Discover,
the Wishlist and the Dashboard open, for admins, as an overlay
over the list through `app/@modal`; `titlePath` in `lib/title-path.ts`);
`POST` takes a decision about one of them (`titleKey`) and answers with
the tile, or the title's new one if it was the tile's last. A show's
single episodes are one line per season, group and version
(`groupEpisodes` in `lib/release-labels.ts`). Its WCX link
(`GET /api/wcx-search?tmdbId=`) searches WCX by the entry's IMDb id (from
`imdb_lookups`, else TMDB's external ids); `wcx` keeps a hit for good and
a miss for an hour, so reopening a title asks nobody.

The title page lists xREL's releases and what the WCX page has together,
right under the toolbar (`components/title-releases.tsx`; rows by
`lib/title-rows.ts`, merged by `combineRows`: a row per name, any case,
xREL's where it has it, newest first; the name shown without the title,
`withoutTitle` keeping a show's `S01`): a movie's as one table, a show's as
a table per season (`seasonGroups`: newest season first, then Specials,
then Other for single episodes, packs of several seasons and names
without one), the newest open and the rest folded away under their
heading, a click on it turning that around (kept however the filters
narrow the list), every one with a match open
while searching. One search, a Quality menu (several at once, none picked when a title opens,
not remembered; with none of the picked ones on the title, all; `resolutionOf`: the
name's, else xREL's category), for a show a season menu (`seasonsOf`;
a pack of several counts for each) and a sort menu (`sortRows`:
Date, newest first by default, Size, Title) go over all of them. A
table starts with what the library has of it (`ghostRows`: a row per
release its files are from, dubbed or not alike ("AC3D" as "AC3", named
after most of its files), named in peach with the library icon, no
link, mirror or date); a listed release the library has a file of
(`libraryNote`) is named in peach with the icon instead of repeated when
it's this very release. Both end the line under the name with the disks
their files are on ("w00t · 720p · x265 · nvme03"). When any row says how many episodes it holds (a
grouped xREL entry's, else WCX's `episode_count_in_season`; of a pack the
library has, how many of it you have), an Episodes column shows the
number framed by a 2px border in its color, no fill, against the season's
aired episodes (`airedBySeason` in `lib/tmdb.ts`, `aired` in
`GET /api/releases/<key>`, kept an hour): red when fewer (a release not
kept up), sky when it has every aired one but more are to come, green when
the season is complete; on a phone it joins the line under the name.
`GET /api/wcx-releases?tmdbId=`
reads the WCX page (`/start/d/<uid>`, kept 10 minutes, so going back and
forth between title pages asks WCX once): its releases with their
mirrors, unchecked, their plain hoster links staying on the server.
WCX keeps a release's links from when it was posted, so after a re-upload
they're gone, and now and then it lists fewer parts than were posted,
while its filecrypt or hide.cx container has them all. So each hoster can
be a mirror per source (`WcxMirror.source`): WCX's plain links, whose
first is checked (`linkInfo`, kept 10 minutes); a hide.cx container, read
through hide.cx's API (no captcha, no account; `liveContainerLinks`, kept
10 minutes), live only if its links are all online, their hoster URLs
asked for one by one only when it's added (`hosterUrls`); and a filecrypt
container (captcha, so not fetched). A mirror's `route` is how it would be
fetched, by its hoster's plain links; a hide.cx container without any
gets it from its own links once they're read, and is left out if nothing
can fetch them. A row has one Check button (`useMirrorCheck`, in a Mirror
column, on a phone on the right of the name): `POST { tmdbId, releases: [uid, …] }`
(every WCX copy of the release) reads the page fresh and tries the
mirrors in order (`lib/mirrors.ts`: RG, DD, then the rest A–Z; per
hoster hide.cx, then WCX's links; only what an account or Real-Debrid
can fetch), adding the first online one to the Queue as a package, its
movie or show set from the title's TMDB entry rather than searched by
name. It's started right away (`started`) only when the library has
nothing of it, told once every file has a name (`nameFiles` in
`lib/download-match.ts` asks the hoster about links that came without
one), and none of its files failed; anything the library has some of
waits in Needs attention for a hand. With none online it offers a filecrypt container (`captcha`: the
button becomes a lock that opens it for its DLC), else `none`. The
button then shows a green check, the lock or a red cross, and a note
says it: "Download started" or "Needs attention" with View to the Queue,
"Behind a captcha: the lock opens it", or "No mirror online", the
release's name under it. A failed request leaves it to be tried again. With several xREL titles, a list above
the table gives each its match note and ⋯ menu. Above them, the poster
carries a tile's mark, smaller: a title the library has the peach
library icon, any other matched to TMDB the wishlist heart (`PosterWish`
in `components/request-tiles.tsx`), the page's one button besides a single
xREL title's ⋯ match menu beside the name; TMDB and WCX
are plain links at the end of the line under the name.
What the library has of a release is worked out for a title page's row
(`libraryNote` in `lib/title-rows.ts`) and a Queue package (`libraryOf`
in `lib/download-library.ts`, see Queue); the library icon is a disk in
peach, what's there said beside it. `fromRelease` (`lib/release-labels.ts`)
decides by the file's name: the release's, any case and separators; for
an episode, the release's name before its `S01` and after it, the
episode's title in between.

## Queue

Admins only (`app/queue/`, `/api/downloads`, `/api/organize`): a package
from when it comes in to when it's in the library, on one page. It's
fetched from the hosters and extracted into `DOWNLOAD_DIR`, then moved by
hand into its title's folder on a disk of the library.

Packages come from DLC
containers (decrypted through JDownloader's key service, `lib/dlc.ts`),
pasted links, or a title page's WCX mirrors; a link of a hoster there's
no account for stays in its package as a failed file ("No account for its
hoster"), and a package with nothing to fetch isn't added. `POST` answers
with the list as `GET` has it; a package it adds starts right away when
it's matched to TMDB, its files have names, none failed and the library
has nothing of it (`startIfNew` in `lib/download-match.ts`), the rest
wait in Needs attention. ddownload.com goes
through its premium account (`DDOWNLOAD_LOGIN`/`PASSWORD`), every other
hoster through Real-Debrid (`REALDEBRID_TOKEN`; `routeOf` in
`lib/hosters.ts`, the file's name from Real-Debrid's answer, which sends
no Content-Disposition). A new package is looked over before it's started: its
TMDB entry from its name (`matchName` in `lib/download-match.ts`, searched
again with umlauts for a German name that spells them out, "Auserwaehlten";
once per package, and once more for one found nothing for before
`MATCHING_CHANGED`, moved on whenever the matching gets better), and every
file is asked about at the hoster once, its size known or not, like
JDownloader's LinkGrabber (`checkPendingFiles`: online, names and sizes
filled in where missing, or failed as offline; one it didn't answer for
asked again after 5 minutes; `onlineOf`, in memory, so a restart asks
again). Downloads go to `DOWNLOAD_DIR`, `/downloads` in
the container: `./downloads` next to the compose file (a bind mount), or
the host folder `DOWNLOADS_PATH` names. The download queue (`lib/downloader.ts`)
runs 1–10 files at a time and extracts each archive set with 7-Zip as soon
as its parts are in, trying the archive passwords set on Settings in turn,
then `ARCHIVE_PASSWORDS`. A file that fails fails its package at once, with
each failed file's name and error (no more of its files start; Retry
fetches just those). Reset deletes what's downloaded and puts the package
back among the new ones. How many files come in at once (Options' Parallel
downloads) and the archive passwords (`app/settings/archive-passwords.tsx`)
are set on Settings.

A finished package goes to its title's folder, by hand. `LIBRARY_DIR` holds one folder per disk, each with
`movies/` and `shows/` (`/library/nvme01/movies`); a single disk is just
one such folder. The folder is "Name (Year)
[tmdbid-N]" with TMDB's German title as TMDB writes it (`libraryFolderName`
in `lib/library-names.ts`: ":" becomes " -", a censored "F***" the word,
what a file name can't have left out, cut to 255 bytes), a show's episodes
into `Season NN`; a disk that has the title already (its `[tmdbid-N]`
folder, whatever it's called) gets them in that folder. Its videos and
subtitles go, not samples or the rest; a movie whose one video is named
with spaces (as VECTOR names them) gets the release's name instead
(`releaseFileNames`; the release name is the folder the archive made, else
the package's, made safe for a path, `safeName`). The disk defaults to the
one that has the title (`defaultTarget` in `app/queue/organize-logic.ts`);
a new title's is always picked by hand ("Pick" in peach until then); every
move is started by hand, one at a time (there's no Move all); a move is
refused when what's queued for that disk leaves too little room
(`startMove`; a Replace too, since the new files are in before the old go).

A move (`lib/library-move.ts`, one at a time, the rest wait) copies every
file as "<name>.part", hashed on the way and flushed to the disk (fsync),
then reads each back and hashes it again, and renames them only if every
hash and size matches; then it marks the package moved (`moved_to`,
`moved_at`, `moved_files`: which file went where), and only then deletes
its download folder. There's no Undo.

A title the library has already (`ownedFiles`: a movie's videos in its
`[tmdbid-N]` folder on any disk, or a show's that are one of the episodes
the package brings by `SxxEyy`, each with its subtitles) isn't moved as
it is: its ⋯ offers Replace (the old files go
once the new ones are in, and the folders they leave empty;
`moved_replaced`) or Delete (the download, files and
all). There's no adding it as another version: one version of everything,
so `POST /api/organize` takes `replace: true` or nothing. A Retry keeps
what was picked. Whether the library has it is asked again when a plain
move starts: another package of the same title moved in meanwhile, it
goes back to Ready to organize with a note ("Not moved") rather than become a
second version. A second click on Move
before the (slow) answer does nothing. `GET` reads the
packages again after looking at the library, so a move that ended
meanwhile is listed where it is now. Once the move queue is through, the
library is scanned again (`rescan` in `lib/rescan.ts`, a fresh run: not one
that listed the disks before the move) and Jellyfin asked
to scan its libraries too (`POST /Library/Refresh`, not waited for), so
what came in counts as owned right away.

The page (`app/queue/page.tsx`) loads the packages (`/api/downloads`) and
what's to move (`/api/organize`, slow over sshfs: it reads the library's
folders) on their own: the packages every second while one downloads or
extracts, what's to move while a move runs, each every 10 s otherwise, the second again when how many are finished changes. Four stat
tiles on top (`StatTile`, like Analytics'; `queueLine` in
`app/queue/logic.ts`), two a row on a phone: Speed, Left (what's still to
download) and Time left while anything comes in or waits to, "—" (muted)
otherwise, and Free (in `DOWNLOAD_DIR`) always. Then the sections (`sections`), empty ones left out, a
table each with the same fixed column widths so they line up
(`downloadColumns` in `app/queue/organize-row.tsx`: Title, Disk, Status,
Size, ⋯): Needs attention (what failed first, downloads, moves and
finished ones that can't be moved; then new ones waiting for a start),
Downloading (in the order they were started), Ready to organize (finished,
to move, also while they move) and Done (in the library, newest first;
folded away from the start unless it's the only section). Each section
folds away and back with a click on its heading (`open` and `onToggle` on
`TableFrame`). A package is a `PackageRow` (`app/queue/package-row.tsx`):
title over the release name; Status, size; on a phone Status and size
are a line under the title. A new one the library has some of (`libraryOf`:
a movie of it, or episodes it brings; a pack in one archive, its
season's) has the library icon after the title, the disks in the Disk
column in peach, and under the release name a tree like Organize's: the
old files' folder, "−" what a Replace takes out, "∗" (blue) what a
Skip leaves as it is, "+" what comes (a
movie's release name, a show's episodes as "S01E03", the archives'
names being no file names, or a pack in one archive by its name). Its
Status is a diffstat like the tree ("−1 +1" in red and green, with Skip
"∗4 +6"; "All in library"), unless the parts' check says something's
off (red, or peach), which it shows then. One version of everything, so its ⋯ offers one way:
another version Download (all of it comes; Replace is Organize's, by
hand), this very release Download missing (a pack is all one or the other;
the episodes the library has aren't fetched, or with a pack in one
archive, which comes whole, aren't moved), and with nothing left to
fetch only Remove. `POST /api/downloads/<id>` refuses a start without one
of those (`choice`), and the package remembers it (`library_choice`): a
Skip pack's move leaves out the episodes the library has (by the last
scan, and still on the disk, since the download goes afterwards).
Download all leaves such packages out.
Parts aren't listed. Status (`components/row-status.tsx`) is
muted text, nothing to click: a new one's parts (`partCheck`: "Checking·
3/8" while the hoster is asked, then "Online·3/3", gaps in a
`.partN.rar` set counting as parts; red when one is missing, peach when
the hoster didn't answer for one; when some failed, why instead, red, and
how many, "No account for its hoster·2 parts", "+1" for another
reason); while it moves a bar (peach
waiting, green coming in, sky extracting, muted paused) over the state
and, while it comes in, speed and time left ("Loading·45.00 MB/s·2
min"; waiting, paused or extracting the state alone); a failed one's error (red,
`errorLine`: without the file's name, as a sentence starts); "—" when finished. What to do about it comes
first in the row's ⋯ menu (`RowMenu`: Start, or Download or Download missing, see
above; Pause, Resume or Retry), then Reset,
Remove or Delete (only red ones are what deletes files; Reset, Remove and
Delete ask "Sure? Click again" first, `ConfirmItem`).

A finished one is an `OrganizeRow` (`app/queue/organize-row.tsx`): the title
(the library icon after it when the library has it) over
where it goes as a little tree (the title's folder, a show's season
folders, each open under its name and a chevron, a click folding it,
every file; what the library has already marked "−" above the
new files marked "+", like a diff), the disk (a menu with each disk's free space;
on a phone the tree's root, with the size in the line under it),
Status ("—", or with files the library has
already how many go and come like a diffstat, "−1 +1" in red and green;
while it's moved a bar per phase,
peach waiting, green copying, sky verifying, with "Moving·speed·time
left"; red why it failed or can't be moved, a crossed-out folder icon
before its release name then), size, and the ⋯ (Move, or Replace;
Retry; Delete, which takes its files too, `DELETE
/api/downloads/<id>?files=delete`; only Delete for one that can't be
moved). A moved one is a `MovedRow`: the folder it went to with its files
(the same tree), the disk,
when it was moved or replaced, and no ⋯.
A row's ⋯ is in a column of its own from sm up, centered, and on a phone
at the end of the title's line (`MENU_CELL`, `PHONE_MENU` in
`components/library-table.tsx`). The page's ⋯ at the top right
(`PageMenu` in `components/page-menu.tsx`, from `AddControls` in
`app/queue/add-form.tsx`; below md in the phone bar, `PageActions`) has Upload DLC and Add links (a box under the
heading), then Download all (when a new one the library has nothing of
waits; it starts only those), Pause all and Resume all
(`queueItems`), then Rescan library and Clear done
(forgets the moved ones, their files stay). DLC files can be dropped
anywhere on the page too, each added after the last one's answer (a DLC
takes a moment to read). A package whose move is running can't be
deleted (a waiting move of one that's deleted is dropped). Rescan
library (`/api/organize/scan`) is the scan after a move by hand,
"Scanning" and disabled while a scan runs (asked for on load and every
10 s).

## Notes

What happens in the background that an admin wants to hear about is kept
as events (`notify` in `lib/events.ts`, the last 50, on globalThis), only
what needs a hand: a download done ("Ready to organize") or failed, a move
failed, a move not done because the library has the title by now
("Not moved"), any sync failed (one note per run, however many asked for
it). What was asked for and is seen happening, a move done or a sync
started by hand, gets none.
`GET /api/events?after=<id>&boot=<id>` hands out what came after; ids
start over with a restart, under a new boot id, and a page that knew
another one gets every event since; `components/event-toasts.tsx` (in the
layout, admins only)
asks every 5 s and shows each as a toast (`error` tone for failures,
`success` for "Ready to organize", `warning` for "Not moved", `mono`
for a release name), only
what happened after the page opened, and fires `COUNTS_STALE` so the
sidebar asks for its counts again (a title page's Check fires it too when
it adds a package).

## Images

The browser never talks to TMDB directly. Every poster, the library's
too (`posterPath`), is TMDB's, through `GET /api/tmdb-image/<size>/<file>`
(`lib/tmdb-image-cache.ts`, `DATA_DIR/tmdb-images`; build URLs with
`tmdbImage()` in `lib/api-client.ts`). Unreferenced TMDB posters are pruned
after a month (`tmdbPosterPaths()` in `lib/store/posters.ts` lists the
referenced ones). A title matched before TMDB had a poster asks again
through `GET /api/tmdb-poster/<movie|tv>/<id>` (at most once an hour,
keeps what it finds and redirects to the cached image; `tmdbPoster()`).
Titles link to TMDB (`tmdbUrl()`), for admins to their title page, never
to Jellyfin. The
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
rejects state changes whose `Sec-Fetch-Site` is `cross-site` or
`same-site`; `next.config.ts` sets the security headers. Jellyfin admins
get the Dashboard, the Queue, Analytics, Settings, the title pages and
their APIs (`ADMIN_ONLY` in `proxy.ts`: the releases, `/api/releases`,
`/api/release-groups`, `/api/wcx-*`; the Queue's, `/api/downloads`,
`/api/organize`, `/api/events`; sync, ignore, config, preferences and
analytics); everyone gets Movies, Shows, Discover and their own Wishlist. Server code reads the user with `currentUser()`
(`lib/auth.ts`); `/` sends admins to the Dashboard, everyone else to
Movies (`app/page.tsx`). `AUTH_ENABLED=false` turns it all off: everyone is
`LOCAL_USER`, an admin, and requests are one shared list.

Requests are one entry per title (`requests`) with everyone who asked
(`requesters`), made on Discover (`app/discover/`, TMDB search or
trending; for admins the favorite groups' releases, TMDB's results under
them while searching) and listed on the Wishlist (`app/wishlist/`, with a search, a Type menu for
movies or shows, and a sort menu: Wanted, only on the overview, Added,
Title; `app/wishlist/logic.ts`); admins see everyone's, most wanted first, everyone else
their own, latest added first. Once the library has a title its request
is dropped, for everyone (`dropFulfilledRequests`, after each library
scan). Changing one
fires `REQUESTS_CHANGED` (`lib/api-client.ts`), so the sidebar's count of
open ones follows. In the UI a request is "on
the wishlist": a poster on Discover has a
heart top right, shown while hovered (always on touch screens), filled
red (`text-wish`) and always there while on, a click toggling it, and an owned one the
peach library icon there instead (`RequestAction` in `components/request-tiles.tsx`); the Wishlist's own
posters have only the on state and no library mark (`WishlistTile`; an
owned title is off the list already), one taken off staying
in its place a moment (2 s) with an empty heart, so a slip can be
clicked back; a title page's poster has the same mark, smaller
(`PosterWish`). A change pops up no note: the heart shows it where it was
clicked. Notes that do pop up (a title page's Check or a failed match change,
the background events) go through `toast()` in `lib/toast.ts`, shown by
`components/toaster.tsx` bottom right, newest at the bottom, at most three:
a card read like a table's title cell, the description (wrapped, never
cut) in Mono for a release name (`mono`), its tone's color only on a thin
stripe at the left (green done, peach waiting on a hand: a Check's "Needs
attention" or captcha, red failed, grey plain), its link if it has one, no × (gone
after 2 s anyway, 5 s with a link); hovering it or focusing its link
holds its time.

## Pages

Client components under `app/` that fetch from the routes above. Page data
loads through `useLoad` (`hooks/use-load.ts`: load on mount, `reload()`,
`setData()` after a change the server answered; only the latest counts,
so a poll asked before an action and answered after it is dropped);
`usePoll` (`hooks/use-poll.ts`) reloads on an interval, one call at a time,
skipping hidden tabs.
Settings loads its status, config, preferences and groups together and
polls them every 2 s while a sync runs, every 15 s otherwise (`pollDelay`
in `app/settings/logic.ts`). Its sync stages are a card each (`StatTile`):
when it last synced, its schedule under it, and its Sync as an icon
button at the top right, spinning while it runs. The two group tables
share their last columns' widths (`SETTINGS_COLUMNS`), and a group's Last
sync is the spinning icon with "Sync" while it syncs (its first list too),
"Waiting" before its first sync. The group tables and Archive passwords
add from a + in the heading's last column, above the rows' ⋯
(`app/settings/add-row.tsx`): it opens a last row with a focused field,
Enter adds and keeps it open for the next, Esc or leaving it empty closes
it; a row's ⋯ removes it after "Sure? Click again" (`ConfirmItem`).
Archive passwords are saved one change at a time (each sends the whole
list). What a page
works out from that data (filtering, sorting, counts, tile texts) is plain functions in its
`logic.ts` next to it, tested without React; shared helpers are in
`lib/facets.ts` (filter and sort, `rankIn` for an ordered list, `libraryView`
for Movies and Shows), `lib/text.ts` (`matchesWords`: every search box,
every word, umlauts folded), and `lib/format.ts` (plurals; numbers with a decimal point and
no thousands separator, "11281", "4.21 GB"; dates German-style,
"30.09.2026"; relative times, `seasonCode`). JSON bodies go through `jsonRequest`
(`lib/api-client.ts`), the app's window events through `useWindowEvent`
(`hooks/`). The look ("Konsole"): dense, the "Dusk" dark palette (a
dark blue-violet grey, lavender as the one accent, soft mint, sand, coral
and sky for states; `app/themes.css`, a few
`--p-*` colors that `app/globals.css` maps onto every UI token, so a new
look is new values there; `viewport.themeColor` in `app/layout.tsx`
repeats the sidebar's), Google Sans for titles, text, buttons and menus,
and Google Sans Code (drawn from it, so the two sit close) for what's
data: table and section headings, file and release
names, codes, disks, numbers in tables, Status lines and the Dashboard's
big numbers; never under posters (both self-hosted by next/font), no tooltips (`title`)
but a chart's values, where hovering is how a chart is read, and a
Status line or a poster's title that's cut off (`titleIfCut` in
`lib/utils.ts`, its whole text): what matters
is said on the page, and a name that gets cut is a layout to fix; color only
where it means something: green for better and red for worse (a gap, a
release short of its season's aired episodes), peach for what the library
has already, tables where a list reads better
than a grid (`DataTable` in `components/library-table.tsx`: one stretched
column, the rest as wide as they need or fixed by `width`; on a page of
sections the first column's name is the section's heading with its count,
"Downloading · 2", the only one shown on a phone; a "·" between values has
half their color and a space each side ("Ready to organize · 6",
"2001 · 9 seasons", "Loading · 54 %" on the Dashboard), except under a
Queue Status bar and in a release's line on the title page, the dense Mono
data, where it has none ("Loading·45 MB/s·2 min", "FuN·1080p·x265"; a
Status line without a bar is spaced, "Online · 4/5"); the logic hands out the values as a list
(a Status line, a poster's meta, a stat's hint), and only `Dots` in
`components/dot.tsx` puts the dots between them, `spaced` or not; a second line
under a title in `text-xs` Mono for a file or release name, while the title
page's release names, its rows' main line, stay Sans; a `phone: false`
column is left out below sm, its value folded into the title cell, so
the table fits a phone instead of scrolling). Movies, Shows, Discover and
the Wishlist are poster grids only. A phone on its side counts as a phone
(`sm` and `md` need some height, `app/globals.css`), but `phone-landscape`
gives it the desktop's columns on the Dashboard, Analytics and Settings and
four posters a row. Sizes switch units from
1000 on (`formatBytes`), so they're never four digits. A narrow no-break
space (U+202F) goes between a number and its unit ("4.21 GB", "58.3 %",
"12 min"): a plain one looked too wide. Every size is
in rem (Tailwind's scale, or `[…rem]`), never px, so the page follows the
browser's font size; only hairlines and tiny radii stay in px. Menus
(`components/ui/dropdown-menu.tsx`) are the card's color with a ring, 0.8125rem (13px)
items, their icons muted. Buttons are outline or ghost, Sign in
too. Shared
UI: `poster-card` (grid tile with corner badges, link or button),
`section-title` (a section's heading: name, hint, and an action on the
right, no count; Discover), `section-frame` (`SectionFrame`, and
`TableFrame`: a table in a frame headed with its section and count, which
can fold its rows away; the Dashboard, the Queue, Settings, Analytics, a
title page), `page-menu`
(the ⋯ at a page's top right, groups of items with a line between:
the Queue),
`page-tools` (`PageTools` around a page's search, filters and sort:
below md they leave the page for the panel the phone bar's search button
folds down, a dot on the button while they narrow the page; the last
mounted wins, so a title page over a list has it; `PageActions` puts a
page's ⋯ in the bar the same way),
`filter-menu` (`FacetMenu`: one toolbar button per facet, multi-select or
`single` with one always picked, which the button then names;
`FilterChips` for what's picked; the buttons, chips and a page's search
box are all equally dark, nothing lights up while it filters), `sort-menu` (the button names the key only, "⇅ Title",
the direction is in its menu), `search-input`,
`empty-state`, `error-alert` (what went wrong, red with its icon),
`library-icon` (the peach disk for what the library has, no tooltip),
`confirm-item` (a menu item that asks "Sure? Click again": the Queue's
Reset, Remove, Delete and Replace, Settings' Remove),
`stat-tile` (a number with a label and, if any, a hint: Analytics, the Queue),
`library-page` (`LibraryPage`: Movies and Shows, the poster grid under
`library-toolbar`'s search, filters and sort; each page gives its load,
view and tile),
`sync-notice` (data still to come with a sync, and its Sync), `load-more`
(the next page once a list is scrolled near its end: Discover's releases;
`test/intersection.ts` scrolls in tests),
`design-icons` (the design canvas's own stroke icons where lucide's
differ: search, sort, a menu's chevron), `dev-tools` (see
Development). `nav` is
the sidebar from md up (`Sidebar`: the Dashboard and the Queue on top
without a heading, then Library (Movies, Shows, Discover, Wishlist) and
Administration (Analytics, Settings), an icon before each, sections a
user has nothing in left out; the logo goes to the user's start page;
counts, all muted and only when above 0, from `/api/status`, the wishlist's open requests and
the Queue's packages not in the library yet (`DOWNLOADS_CHANGED` from
the Queue page keeps that one current),
Sign out at the bottom, there with sign-in off too, doing nothing, in
`next dev` with a Dev section above it) and below md a slim bar
(`MobileBar`): the logo and the page's name (pages hide their own
heading there, `max-md:sr-only`; a title page is "Releases"), a page's ⋯
and search button, and a menu button that opens a full-screen panel
with every page. `app/manifest.ts` makes it a phone home-screen app
(standalone, the sidebar's color, `apple-icon.png`). `app/not-found.tsx` is
the 404, over the whole window without the nav (the sign-in page's
card: the logo, a big 404 and the way back to `/`). The sign-in page has no nav either: one
card with a shadow, the logo and "Sign in to Jellylens" on top of the form.
In `next dev` it stays open while signed in, to look at.
The Dashboard (`app/dashboard/`) is the admins' start page: on top, when
it has any, what's in the Queue (`QueueTable` in `rail.tsx`, `queueRows` in
`logic.ts`: every row but Done and a new one still checked, a row per
title with where it's at in the Queue's words, Error in red, Needs
attention in peach, a running download or move with its share, Ready to
organize; the speed and time left in its heading; the details stay on the
Queue, which a click opens); then Incomplete shows when there are any (`missing-table.tsx`, its
heading counting the shows), a row per season with
episodes missing, finished or airing (`missingShows`, most missing
first), its episodes as dots (red missing, outlined not aired yet, plain
owned) and a ⋯ to ignore the show (a whole show only, never a single
season); under it the last
7 days' imports as posters, when there are any (`recentImports`, `ImportsTable`); beside them
from xl up the wishlist's open titles, when it has any, and the library's
disks with what's free, red under 5 %; below xl one column: the Queue,
the wishlist, Incomplete shows, the imports, the disks. What's ignored is
listed on Settings (Ignored incomplete shows,
`app/settings/ignored-shows.tsx`, `ignoredList`), each with Unignore.
Ignore entries are `{ showId }`.
Analytics (`app/analytics/`, one page over both libraries; `GET
/api/analytics`, `lib/store/files.ts`; the rows in `logic.ts`, the boxes in
`charts.tsx`): three stat tiles (Storage, Movies, Shows), then German ×
English (the share of files with both, a bar each for movies and episodes,
the other mixes in its footer), Resolution × Codec (a heatmap of sizes and
files) and Release groups (the ten largest by size as bars, the rest
folded into one row, files without a group last; hovering or tapping one
says its movies, episodes and share in the footer). Which files a title
has shows on its page (an admin's poster click on Movies or Shows opens
it). `releaseGroupOf` reads the group from the end of
a scene-style or Sonarr/Radarr name, from the front of a lowercase scene
short name ("pl3x-heman.s01e01"), or else from the file's folder (season
packs); files without one are "n/a".

## Development

`docker compose -f docker-compose.dev.yml up -d` runs `next dev` in a
container on http://localhost:8081, with `nextapp/` bind-mounted; it reloads
on save, so there's no need to restart the container after an edit (only
after changing `next.config.ts`, the env or `package.json`). Type checks,
lint and tests run in the container (`docker compose -f
docker-compose.dev.yml exec media-overview npm run typecheck`, `… npm run
lint`, `… npm test`; the tests with `AUTH_ENABLED` unset, `… exec -e
AUTH_ENABLED= media-overview npm test`, else a dev env's `false` fails the
sign-in ones). Prettier formats the code (`.prettierrc.json`, width
120, Tailwind classes sorted by its plugin; `components/ui/` stays as shadcn
wrote it): run `… npm run format` after an edit. The library's disks are
mounted by a gitignored `docker-compose.dev.local.yml` at `/library/<disk>`
(start with both files, `-f docker-compose.dev.yml -f
docker-compose.dev.local.yml`); the dev container installs ffmpeg for
ffprobe on start, like the image.

In `next dev` only, the sidebar has a Dev section above Sign out
(`components/dev-tools.tsx`; on a phone the same two as buttons in the
menu panel, above Sign out): Test toasts pops up every note the app
shows, one after another, with made-up text (keep its list current when a
`toast()` or `notify()` is added), and Mock data (remembered in the
browser, a reload on each change): while it's on, the Queue and Settings show made-up data
(`lib/mock/data.ts`, `lib/mock/settings.ts`, answered in the browser by
`lib/mock/fetch.ts`; their actions, Sync and ignoring a show are refused,
nothing reaches the database), every state they can show. The routes are
mocked whoever asks, so the Dashboard's Queue, imports and disks are the
mock's too, and so are `/api/status` (the sidebar's counts) and the
library scan (`/api/organize/scan`, running); Settings' Ignored incomplete shows
stays real. Keep it current: a change to those pages or their responses
(`DownloadsResponse`, `OrganizeResponse`, `StatusResponse`,
`ConfigResponse`, `ReleaseGroupsResponse`, `Preferences`) updates the mock
data in the same change, a new state gets an example there
(`lib/mock/mock.test.ts` checks every Queue section has one).

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
(`.github/workflows/docker.yml`) runs lint, `npm run format:check`, `npm run typecheck` (which runs
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
