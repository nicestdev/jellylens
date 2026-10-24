// Where a log line is from (lib/log.ts), for its filter on the Logs page.
export const LOG_AREAS = [
  "app",
  "auth",
  "db",
  "dload",
  "downloads",
  "images",
  "jellyfin",
  "library",
  "match",
  "organize",
  "settings",
  "tmdb",
  "wcx",
  "wishlist",
  "xrel",
] as const;
export type LogArea = (typeof LOG_AREAS)[number];

const LABELS: Record<string, string> = {
  app: "App",
  auth: "Sign-in",
  db: "Database",
  dload: "DLoad",
  downloads: "Downloads",
  images: "Images",
  jellyfin: "Jellyfin",
  library: "Library",
  match: "Matching",
  organize: "Organize",
  settings: "Settings",
  tmdb: "TMDB",
  wcx: "WCX",
  wishlist: "Wishlist",
  xrel: "xREL",
};
export const areaLabel = (area: string) => LABELS[area] ?? area;
