<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Media Library Overview

A personal dashboard over a Jellyfin library: movies, TV shows, and
missing-episode detection (cross-referenced against TMDB). An analytics page
(storage/count stats) existed earlier and was removed for now — straightforward
to recreate if it comes back: a `computeAnalytics(store)` reading
`store.jellyfin.movies/shows/episodes` (movies and episodes both carry a `Size`
field in bytes), a `GET /api/analytics` route, and a page with stat tiles.

## Stack

- Next.js App Router (TypeScript), backend logic lives in Route Handlers under
  `app/api/**` — there is no separate backend service.
- UI: shadcn/ui (components live as source in `components/ui/`, built on Base UI
  primitives in this shadcn version — not Radix, despite older docs/examples
  assuming Radix). Tailwind v4. `next-themes` for the dark/light toggle.
- No database. All state is an in-memory object (`lib/store.ts`) persisted to
  `DATA_DIR/cache.json` (default `/app/data`, a Docker volume in compose).

## Data flow — three independent sync stages

1. **Sync Jellyfin** (`lib/sync-jellyfin.ts`) — pulls movies/shows/episodes from
   the Jellyfin API into `store.jellyfin`.
2. **Sync TMDB** (`lib/sync-tmdb.ts`) — for every show with a TMDB id, pulls the
   full season/episode list (only counting episodes whose `air_date` has passed)
   into `store.tmdb`. Chains a missing-recheck afterward automatically.
3. **Recheck missing** (`lib/compute-missing.ts`) — pure, synchronous, no
   network: diffs `store.jellyfin.episodes` against `store.tmdb` to find
   already-aired episodes not owned. Handles combined multi-episode files via
   Jellyfin's `IndexNumberEnd` field (e.g. one file covering S02E01-E02).

Each stage has its own manual trigger (`POST /api/sync/jellyfin`,
`/api/sync/tmdb`, `/api/recheck-missing`) and its own interval, scheduled once
at server boot from `instrumentation.ts` (`JELLYFIN_SYNC_INTERVAL_HOURS`,
`TMDB_SYNC_INTERVAL_HOURS`, `MISSING_RECHECK_INTERVAL_HOURS` env vars, defaults
6/24/24; `0` disables that stage's automatic schedule). The env vars are the
only source — the Settings page shows them read-only. `lib/sync-manager.ts` holds the
trigger functions (deduped via `lib/scheduler.ts`'s `makeTrigger` so a manual
click racing a scheduled tick never runs the same stage twice concurrently).

`GET /api/movies` / `/api/shows` / `/api/status` all read straight from the
in-memory `store` — no live Jellyfin/TMDB calls on page load, only during an
explicit sync.

## Required env vars

`JELLYFIN_URL`, `JELLYFIN_API_KEY`, `TMDB_API_KEY` — see `.env.example` at the
repo root. The Jellyfin user is resolved automatically at boot (first admin
account found via `/Users`) — there's no user picker.

The browser never talks to `JELLYFIN_URL`: posters go through
`GET /api/image/<id>` (`lib/image-cache.ts`, cached under `DATA_DIR/images`,
pruned after each Jellyfin sync). Only "Open in Jellyfin" links point at
Jellyfin, via the optional `JELLYFIN_PUBLIC_URL`.

## Sign-in

`proxy.ts` gates every page and `/api/*` route (except `/login` and
`/api/auth/*`). Users sign in with their Jellyfin username/password, checked
once via `/Users/AuthenticateByName` (`lib/jellyfin.ts`); the Jellyfin token
is signed out right away, and Jellylens keeps its own HMAC-signed cookie
(`lib/session.ts`, secret generated into `DATA_DIR/session-secret`). Jellyfin
admins get Missing, Settings and the sync/ignore APIs (`ADMIN_ONLY` in
`proxy.ts`); everyone gets Movies, TV Shows and their own Requests. Server
code reads the user with `currentUser()` (`lib/auth.ts`). `AUTH_ENABLED=false`
turns it all off: everyone is `LOCAL_USER`, an admin, and requests are one
shared list again.

Requests are one entry per title with a `requesters` list; admins see
everyone's on the Requests page's "Everyone" tab, most-requested first.

## Pages

`app/movies`, `app/shows`, `app/missing` — all client components (`'use client'`)
that fetch from the routes above. `components/nav.tsx` highlights the active
route. `components/media-list.tsx` (Table-based list + Badge facet filters) and
`components/sync-menu.tsx` are shared between the movies and shows pages.

## Working with shadcn components

Add new components with `npx shadcn@latest add <name>` rather than hand-writing
them — this version's primitives (`@base-ui/react`, not Radix) and APIs may not
match older shadcn examples. Check `ui.shadcn.com/llms.txt` or the installed
component's own source in `components/ui/` before assuming an API.

