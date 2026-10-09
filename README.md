<div align="center">

<img src="docs/logo.svg" width="96" alt="Jellylens logo" />

# Jellylens

**See what's missing from your Jellyfin library.**

Browse your movies and shows, find missing episodes and seasons, complete
your movie collections, catch bad TMDB matches, and keep a wishlist of what
to add next.

[![Build](https://github.com/nicestdev/jellylens/actions/workflows/docker.yml/badge.svg)](https://github.com/nicestdev/jellylens/actions/workflows/docker.yml)
[![Image](https://img.shields.io/badge/ghcr.io-nicestdev%2Fjellylens-a78bfa?logo=docker&logoColor=white)](https://github.com/nicestdev/jellylens/pkgs/container/jellylens)
[![License](https://img.shields.io/badge/license-MIT-a78bfa)](LICENSE)

</div>

## Features

- 🎬 **Library overview**: your movies and shows as a poster grid, with the resolution on each movie and the airing status on each show. Search, sort, and filter by genre or audio language.
- 🧩 **Missing episodes**: gaps, whole missing seasons and seasons that are still airing, all checked against TMDB. Ignore anything you don't care about.
- 🎞️ **Movie collections**: for every TMDB collection you own part of (*The Lord of the Rings*, *Bourne*, …), the movies you don't have yet. Only those out on disc or digital count, and each one goes on your wishlist with a click on its poster. A badge shows which of your favorite release groups have released a missing movie; click it to see the releases.
- 🔍 **Mismatch detection**: episodes and seasons TMDB doesn't know about, usually a wrong match or a duplicate file.
- 🗣️ **Language coverage**: flags shows where only some seasons have your audio language.
- 📝 **Discover and Wishlist**: search TMDB or browse what's trending and put what you want on your Wishlist. Titles you own are marked, and wishlist entries switch to *In library* when they show up in Jellyfin, with the next digital or Blu-ray date for what isn't out yet. Everyone has their own Wishlist; admins see all of them, most wanted first, with a badge for the favorite release groups that have released each one, which opens its releases.
- 📦 **Releases**: pick your favorite P2P and scene groups in Settings, and Jellylens keeps their release lists from [xREL](https://www.xrel.to) in sync. The Releases page shows each title as a poster with the qualities it comes in; search and filter by group or quality to see whether something is out from a group you like, and open a title for its page with every release of it, plus what [WCX](#wcx-and-downloads) lists for it with its download mirrors. Releases below 720p (XviD, SD, DVD) are hidden unless you turn them on in Settings. Each title is checked against its release names, so a release xREL linked to the wrong movie doesn't show that movie's poster or title.
- 📊 **Analytics**: what your movies' and episodes' files are made of: totals, and charts of files and storage by release group, audio language, resolution and codec. Click a piece of a chart to list its files, or search, filter and sort every file below.
- ⬆️ **Upgrades**: pick one of your favorite release groups and see which of your movies, or seasons of your shows, it has released too, in the quality and codec you want: what changes for each (group, quality, codec, original audio), how much storage it frees or takes, and how the group's share of your library would grow. Narrow it to the groups you have now, or to releases that add the original audio to a German-only file.
- 📥 **Downloads**: drop in DLC containers, paste hoster links or pick a WCX mirror on a title page. Each package is matched to its movie or show on TMDB and checked against your library, so you can leave out the episodes you already have, and only starts when you say so. ddownload.com goes through your premium account, every other hoster through Real-Debrid. A queue of 1–10 files at a time with pause, resume and retry; archives are extracted with 7-Zip as soon as their parts are in, with the passwords you set.
- 🔐 **Jellyfin sign-in**: log in with your Jellyfin account. Missing, Releases, Downloads, Analytics, Upgrades and Settings are for Jellyfin admins only.
- 🔄 **Automatic sync**: Jellyfin, TMDB and xREL refresh on a schedule you set with environment variables; the Settings page shows it and lets you sync or recheck what's missing right away.
- 📱 **Works on any device**: responsive, dark UI with a sidebar on desktop and a full-screen menu on phones.

## Installation

```yaml
services:
  jellylens:
    image: ghcr.io/nicestdev/jellylens:latest
    container_name: jellylens
    environment:
      JELLYFIN_URL: http://192.168.1.10:8096
      JELLYFIN_API_KEY: your_jellyfin_api_key
      TMDB_API_KEY: your_tmdb_api_key
    volumes:
      - ./data:/app/data
    ports:
      - 3000:3000
    restart: unless-stopped
```

Available for `linux/amd64` and `linux/arm64`.

## Configuration

| Variable | Required | Default | Description |
| --- | :---: | :---: | --- |
| `JELLYFIN_URL` | ✅ | | Address of your Jellyfin server, as seen from the container |
| `JELLYFIN_API_KEY` | ✅ | | Jellyfin API key (*Dashboard → API Keys*) |
| `TMDB_API_KEY` | ✅ | | [TMDB API key](https://www.themoviedb.org/settings/api) (v3) |
| `JELLYFIN_SYNC_INTERVAL_HOURS` | | `6` | Hours between Jellyfin library syncs, `0` = off |
| `TMDB_SYNC_INTERVAL_HOURS` | | `24` | Hours between TMDB metadata refreshes, `0` = off |
| `MISSING_RECHECK_INTERVAL_HOURS` | | `24` | Hours between rechecks for missing episodes and movies, `0` = off |
| `XREL_SYNC_INTERVAL_HOURS` | | `6` | Hours between syncs of your release groups' lists from xREL, `0` = off |
| `AUTH_ENABLED` | | `true` | Sign in with Jellyfin accounts; `false` opens Jellylens to anyone who can reach it |
| `WCX_URL` | | | WCX site address, for the links to its pages |
| `WCX_API_URL` | | | WCX API address; unset turns the WCX lookups off |
| `DDOWNLOAD_LOGIN` | | | ddownload.com premium account, for Downloads |
| `DDOWNLOAD_PASSWORD` | | | Its password |
| `REALDEBRID_TOKEN` | | | [Real-Debrid API token](https://real-debrid.com/apitoken), for links on every other hoster |
| `ARCHIVE_PASSWORDS` | | | Comma-separated passwords tried on archives, after the ones set on Settings |
| `DOWNLOAD_DIR` | | `/app/data/downloads` | Where downloads are saved and extracted inside the container |

All data is kept in `/app/data`: the SQLite database `jellylens.db` (library, requests, settings, releases) and the poster caches. The server runs as the unprivileged `node` user and takes ownership of that folder when the container starts, so a bind mount like `./data` works whoever owns it.

### WCX and Downloads

Both are optional and stay out of the way until configured. Without `WCX_API_URL`, title pages show xREL's releases only. The Downloads page needs `DDOWNLOAD_LOGIN`/`DDOWNLOAD_PASSWORD`, `REALDEBRID_TOKEN` or both, depending on the hosters you use.

#### Supported hosters

| Hoster | Through | Needs |
| --- | --- | --- |
| [ddownload.com](https://ddownload.com) (also `ddl.to`) | its own premium account | `DDOWNLOAD_LOGIN`, `DDOWNLOAD_PASSWORD` |
| every hoster [Real-Debrid supports](https://real-debrid.com/compare), e.g. Rapidgator | Real-Debrid | `REALDEBRID_TOKEN` |

A link on a hoster neither covers is reported on its package. DLC containers are decrypted through JDownloader's key service; their links then go the same way.

Downloads land in the data folder by default. To have them next to your media instead, mount a host folder and point `DOWNLOAD_DIR` at it:

```yaml
    environment:
      DOWNLOAD_DIR: /downloads
    volumes:
      - ./data:/app/data
      - /srv/media/downloads:/downloads
```

### Exposing Jellylens to the internet

Jellylens is built to sit behind a reverse proxy or a Cloudflare Tunnel:

- Keep `AUTH_ENABLED` on. Sessions last 7 days and are checked against Jellyfin on every request, so disabling or deleting a user in Jellyfin locks them out within a minute.
- Failed sign-ins are limited to 5 per 15 minutes per IP and per username. Jellylens reads the client IP from `CF-Connecting-IP` (Cloudflare) or `X-Forwarded-For`, so don't also expose the container port directly.
- Serve it over HTTPS; the session cookie is then marked `Secure` automatically.
- Jellyfin locks accounts itself after repeated wrong passwords. For extra protection, add a Cloudflare rate-limiting rule for `/api/auth/login` or put Cloudflare Access in front.

#### With a Cloudflare Tunnel

1. In the Cloudflare dashboard, go to *Zero Trust → Networks → Tunnels*, create a tunnel of type *Cloudflared* and copy its token.
2. Add a public hostname to the tunnel, e.g. `jellylens.example.com`, pointing to the service URL `http://jellylens:3000` (the compose service name; plain `http`, Cloudflare handles HTTPS).
3. Run `cloudflared` next to Jellylens. Jellylens needs no `ports:` then: it's only reachable through the tunnel.

```yaml
services:
  jellylens:
    image: ghcr.io/nicestdev/jellylens:latest
    container_name: jellylens
    environment:
      JELLYFIN_URL: http://192.168.1.10:8096
      JELLYFIN_API_KEY: your_jellyfin_api_key
      TMDB_API_KEY: your_tmdb_api_key
    volumes:
      - ./data:/app/data
    restart: unless-stopped

  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    command: tunnel --no-autoupdate run
    environment:
      TUNNEL_TOKEN: your_tunnel_token
    depends_on:
      - jellylens
    restart: unless-stopped
```

Both services share the compose network, so the tunnel reaches Jellylens by its service name. If you also want to open it at home without the tunnel, publish the port on your server's LAN address only (e.g. `192.168.1.20:3000:3000`), and make sure your router doesn't forward it.

## Development

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d   # next dev
docker compose up -d --build                     # local production build
```

Tests, lint, formatting and type checks run inside the dev container (CI runs the same
before every image build):

```bash
docker compose -f docker-compose.dev.yml exec media-overview npm test
docker compose -f docker-compose.dev.yml exec media-overview npm run lint
docker compose -f docker-compose.dev.yml exec media-overview npm run format:check
docker compose -f docker-compose.dev.yml exec media-overview npm run typecheck
```

The app is a Next.js project in [`nextapp/`](nextapp).

## License

[MIT](LICENSE)
