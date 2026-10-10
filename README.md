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

- 🎬 **Library**: your movies and shows as posters, read straight from your disks; search, sort, filter by genre or audio language.
- 🧩 **Missing**: missing episodes and seasons, checked against TMDB.
- 🎞️ **Collections**: the movies you lack from collections you own part of.
- 🔍 **Mismatches**: episodes and seasons TMDB doesn't know, usually a bad match.
- 📝 **Discover and Wishlist**: search TMDB, keep a wishlist per user.
- 📦 **Releases**: your favorite release groups' releases from [xREL](https://www.xrel.to), with [WCX](#wcx-and-downloads) mirrors.
- 📊 **Analytics**: your files by group, language, resolution and codec.
- ⬆️ **Upgrades**: what a favorite group has in better quality than yours.
- 📥 **Downloads**: DLC containers and hoster links, via ddownload and Real-Debrid, extracted with 7-Zip.
- 📂 **Organize**: move finished downloads into your library, checked, with Undo; replace what you have or keep both; then a rescan, Jellyfin's too.
- 🔔 **Notes**: a heads-up when a download, a move or a sync is done or failed.
- 🔐 **Jellyfin sign-in**: admin pages for Jellyfin admins only.
- 🔄 **Automatic sync** of your disks, TMDB and xREL, on a schedule you set.
- 📱 **Any device**: dark, responsive UI.

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
      TMDB_LANGUAGE: en-US
      LIBRARY_DIR: /library
      DOWNLOAD_DIR: /downloads
      # Optional: Downloads (see WCX and Downloads)
      # DDOWNLOAD_LOGIN: your_ddownload_login
      # DDOWNLOAD_PASSWORD: your_ddownload_password
      # REALDEBRID_TOKEN: your_realdebrid_token
    volumes:
      - ./data:/app/data
      - ./downloads:/downloads
      - /srv/media:/library/disk1
    ports:
      - 3000:3000
    restart: unless-stopped
```

Available for `linux/amd64` and `linux/arm64`.

## Configuration

| Variable | Required | Default | Description |
| --- | :---: | :---: | --- |
| `LIBRARY_DIR` | ✅ | | Your library's disks inside the container (see [Library](#library)) |
| `JELLYFIN_URL` | ✅ | | Address of your Jellyfin server, as seen from the container, for sign-in and rescans |
| `JELLYFIN_API_KEY` | ✅ | | Jellyfin API key (*Dashboard → API Keys*) |
| `TMDB_API_KEY` | ✅ | | [TMDB API key](https://www.themoviedb.org/settings/api) (v3) |
| `TMDB_LANGUAGE` | | `en-US` | Language of titles, genres and posters, e.g. `de-DE` |
| `LIBRARY_SCAN_INTERVAL_HOURS` | | `6` | Hours between library scans, `0` = off |
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

All data is kept in `/app/data`: the SQLite database `jellylens.db` (library, file probes, requests, settings, releases) and the poster cache. The server runs as the unprivileged `node` user and takes ownership of that folder when the container starts, so a bind mount like `./data` works whoever owns it.

### WCX and Downloads

Both are optional and stay out of the way until configured. Without `WCX_API_URL`, title pages show xREL's releases only. The Downloads page needs `DDOWNLOAD_LOGIN`/`DDOWNLOAD_PASSWORD`, `REALDEBRID_TOKEN` or both, depending on the hosters you use.

#### Supported hosters

| Hoster | Account | Covers |
| --- | --- | --- |
| [ddownload.com](https://ddownload.com) | Premium: `DDOWNLOAD_LOGIN`, `DDOWNLOAD_PASSWORD` | ddownload.com, ddl.to |
| [Real-Debrid](https://real-debrid.com) | API token: `REALDEBRID_TOKEN` | [every hoster it supports](https://real-debrid.com/compare), e.g. Rapidgator |

A link on a hoster neither covers stays in its package, marked *No account for its hoster*. DLC containers are decrypted through JDownloader's key service; their links then go the same way.

Downloads and their extracted files go to the `/downloads` mount; point it at any host folder, e.g. one next to your media. Without `DOWNLOAD_DIR` they land in the data folder.

### Library

Jellylens reads your library from its disks, not from Jellyfin. `LIBRARY_DIR` holds **one folder per disk, each with a `movies` and a `shows` folder** in it:

```
/library
├── disk1
│   ├── movies
│   └── shows
└── disk2
    ├── movies
    └── shows
```

Mount each disk on its own (`- /mnt/disk1:/library/disk1`, `- /mnt/disk2:/library/disk2`), so Jellylens sees each one's free space. With a single disk, mount just that one.

Every title needs its own folder named `Name (Year) [tmdbid-N]`, and every episode file an `S01E02` in its name; folders without a TMDB id are skipped. The first scan reads every video with ffprobe, which takes a while; later scans only read new or changed files.

### Organize

The Organize page moves finished downloads into your library. It lists the disks with their free space, and for each download picks the disk that already has the title, else the first one it fits on; you can pick another.

A movie goes to `movies/Name (Year) [tmdbid-N]/`, a show's episodes to `shows/Name (Year) [tmdbid-N]/Season NN/`, named with TMDB's title as TMDB writes it. A disk with a folder for that TMDB id already, whatever it's called, gets the files in that folder. Only videos and subtitles go, not samples, `.nfo` or other extras; a movie's video named with spaces gets the release's name instead.

If the library has the title already, you choose: **Replace** takes the old files out once the new ones are in (no Undo then), **Add as version** keeps both, or **Delete** the download.

After a move, Jellylens scans the library again and asks Jellyfin to do the same, so point your Jellyfin libraries at the same folders (or a pool over them). **Rescan library** in the Organize page's ⋯ menu does it by hand.

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
      TMDB_LANGUAGE: en-US
      LIBRARY_DIR: /library
      DOWNLOAD_DIR: /downloads
      # Optional: Downloads (see WCX and Downloads)
      # DDOWNLOAD_LOGIN: your_ddownload_login
      # DDOWNLOAD_PASSWORD: your_ddownload_password
      # REALDEBRID_TOKEN: your_realdebrid_token
    volumes:
      - ./data:/app/data
      - ./downloads:/downloads
      - /srv/media:/library/disk1
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
