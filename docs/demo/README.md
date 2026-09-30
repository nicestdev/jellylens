# Demo library for screenshots

The screenshots in the main README come from a fake Jellyfin with a small
library of free and public-domain titles: Blender open movies and old
public-domain TV shows. [`mock-jellyfin.mjs`](mock-jellyfin.mjs) serves only
the endpoints Jellylens calls. It takes metadata, episode lists and posters
from TMDB and leaves some episodes out on purpose, so every card on the
Missing page has something to show.

It needs Node 20+ and a TMDB API key; nothing to install.

```bash
# 1. The mock, on port 8097
TMDB_API_KEY=your_tmdb_api_key node docs/demo/mock-jellyfin.mjs

# 2. Jellylens against it, with its own data folder (from nextapp/)
cd nextapp
npm run build
JELLYFIN_URL=http://localhost:8097 JELLYFIN_API_KEY=demo \
TMDB_API_KEY=your_tmdb_api_key DATA_DIR=/tmp/jellylens-demo \
npx next start -p 3200
```

Sign in at http://localhost:3200 as `demo` / `demo`. The first sync runs
at startup.

A production build (`next start`) keeps the dev-mode badge out of the
screenshots. The README ones are 1280×800 at 2× (2560×1600), dark theme,
saved as JPG at quality 85.
