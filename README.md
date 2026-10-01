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

- 🎬 **Library overview**: poster grids for movies and shows. Search, sort, and filter by genre, audio language or airing status.
- 🧩 **Missing episodes**: gaps, whole missing seasons and seasons that are still airing, all checked against TMDB. Ignore anything you don't care about.
- 🎞️ **Movie collections**: for every TMDB collection you own part of (*The Lord of the Rings*, *Bourne*, …), the movies you don't have yet. Only those out on disc or digital count, and each one can be requested right from its card. Optionally shows the file names you own, so you can get the rest from the same release group.
- 🔍 **Mismatch detection**: episodes and seasons TMDB doesn't know about, usually a wrong match or a duplicate file.
- 🗣️ **Language coverage**: flags shows where only some seasons have your audio language.
- 📝 **Requests**: search TMDB or browse what's trending and keep a wishlist. Titles you own are marked, and requests switch to *Available* when they show up in Jellyfin. Everyone has their own list; admins see all of them, most wanted first.
- 📦 **Releases**: pick your favorite P2P groups in Settings, and Jellylens keeps their release lists from [xREL](https://www.xrel.to) in sync. The Releases page shows one poster per title with the qualities it comes in; search and filter by group, quality or type to see whether something is out from a group you like. Each title is checked against its release names, so a release xREL linked to the wrong movie doesn't show that movie's poster or title.
- 🔐 **Jellyfin sign-in**: log in with your Jellyfin account. Missing, Releases and Settings are for Jellyfin admins only.
- 🔄 **Automatic sync**: Jellyfin, TMDB and xREL refresh on a schedule you set with environment variables; the Settings page shows it and lets you sync right away.
- 📱 **Works on any device**: responsive, dark UI that works on desktop and phone.

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

All data is kept in `/app/data`: the SQLite database `jellylens.db` (library, requests, settings, releases) and the poster caches. The server runs as the unprivileged `node` user and takes ownership of that folder when the container starts, so a bind mount like `./data` works whoever owns it.

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

Tests, lint and type checks run inside the dev container (CI runs the same
before every image build):

```bash
docker compose -f docker-compose.dev.yml exec media-overview npm test
docker compose -f docker-compose.dev.yml exec media-overview npm run lint
docker compose -f docker-compose.dev.yml exec media-overview npm run typecheck
```

The app is a Next.js project in [`nextapp/`](nextapp).

## License

[MIT](LICENSE)
