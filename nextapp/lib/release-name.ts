// What a release's name says about it: its codec, audio and episodes.

// A release's video codec by its name, as Analytics labels a file's
// (codecLabel in lib/analytics.ts): x264 for any H.264, x265 for H.265;
// "" if the name doesn't say.
export function codecOf(name: string): string {
  if (/[.-]([xh]\.?265|hevc)[.-]/i.test(name)) return "x265";
  if (/[.-]([xh]\.?264|avc)[.-]/i.test(name)) return "x264";
  if (/[.-]av1[.-]/i.test(name)) return "AV1";
  return "";
}

// German plus the original audio (DL, "dual language") or several more
// (ML), by the tag in the release's name; null: German only, as far as
// the name says. "WEB-DL" is a source, not this.
export function audioOf(name: string): "DL" | "ML" | null {
  const m = /\.(DL|ML)\./i.exec(name);
  return m ? (m[1].toUpperCase() as "DL" | "ML") : null;
}

// The season and episodes a show's release has: one episode
// ("S01E02"), two in one ("S01E01E02", "S01E01-E02"), or the whole season
// (a pack, "S01" alone: episodes null). null for anything else, like a
// pack of several seasons ("S01-S03").
export function episodesOf(name: string): { season: number; episodes: number[] | null } | null {
  const ep = /\.S(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))?\./i.exec(name);
  if (ep) {
    const first = Number(ep[2]);
    const last = ep[3] ? Number(ep[3]) : first;
    return {
      season: Number(ep[1]),
      episodes: Array.from({ length: Math.max(1, last - first + 1) }, (_, i) => first + i),
    };
  }
  const pack = /\.S(\d{1,2})\./i.exec(name);
  return pack ? { season: Number(pack[1]), episodes: null } : null;
}
