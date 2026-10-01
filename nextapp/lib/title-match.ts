import { fold } from "./text";

// Checks whether a TMDB entry really is the movie or show a release is of,
// going by the release name — xREL now and then ties releases to the wrong
// title, and the Releases page shouldn't show (or be searchable by) one.

// Words in a release name that end its title: languages, editions, season
// and episode, resolution, source, codecs, audio.
const TAG =
  /^(german|english|french|spanish|italian|japanese|dl|ml|dual|multi|subbed|dubbed|uncut|unrated|remastered|extended|imax|theatrical|directors|dc|proper|repack|internal|complete|limited|s\d{1,2}(e\d{1,3})*|e\d{1,3}|\d{3,4}p|uhd|4k|hdr|hdr10|dv|web|webrip|web-dl|bluray|bdrip|hdrip|dvdrip|hdtv|x264|x265|h264|h265|hevc|avc|ac3|ac3d|eac3|dts|dtshd|truehd|atmos|aac|dd|ddp5|dd5|flac)$/i;

export type ParsedName = { title: string; year: number | null };

// "The.OutLaws.2023.German.AC3.DL.1080p.Web.x265-FuN" -> The OutLaws, 2023.
// The year is the last one before the tags, so "Blade.Runner.2049.2017"
// is Blade Runner 2049 from 2017 (2049 can't be a release year anyway).
export function parseReleaseName(name: string): ParsedName {
  const tokens = name.replace(/-[^.-]+$/, "").split(".");
  let end = tokens.findIndex((t, i) => i > 0 && TAG.test(t));
  if (end < 0) end = tokens.length;
  const latest = new Date().getFullYear() + 1;
  let yearAt = -1;
  for (let i = 1; i < end; i++) {
    const n = Number(tokens[i]);
    if (/^\d{4}$/.test(tokens[i]) && n >= 1900 && n <= latest) yearAt = i;
  }
  return {
    title: tokens.slice(0, yearAt > 0 ? yearAt : end).join(" "),
    year: yearAt > 0 ? Number(tokens[yearAt]) : null,
  };
}

const ROMAN: Record<string, string> = { ii: "2", iii: "3", iv: "4", v: "5", vi: "6", vii: "7", viii: "8", ix: "9", x: "10" };
const words = (s: string) => fold(s).split(" ").filter(Boolean).map((w) => ROMAN[w] ?? w);

// Most of the shorter title's words appear in the longer one, so a German
// subtitle on either side ("Nirvana" / "Nirvana - Die Zukunft ist ein
// Spiel") or an apostrophe doesn't count against it. Spelled without its
// spaces the same counts too ("OutLaws" / "Out-Laws").
export function sameTitle(a: string, b: string): boolean {
  const wa = words(a);
  const wb = new Set(words(b));
  if (!wa.length || !wb.size) return false;
  if (wa.join("") === [...words(b)].join("")) return true;
  const common = new Set(wa.filter((w) => wb.has(w))).size;
  return common / Math.min(new Set(wa).size, wb.size) >= 0.6;
}

export type Candidate = { title: string; originalTitle: string; year: number | null };

// A candidate fits a release if one of its titles (TMDB's localized or
// original, or other titles TMDB lists for it) is the release name's title,
// and the years are at most one apart (festival premiere vs. release) where
// both are known. xREL's own title doesn't count: it comes with the same
// link that may be wrong.
// With the very same title the years may be up to three apart, as a film can
// premiere at festivals years before it's released; a remake of the same
// name is usually decades off.
export function fitsRelease(release: ParsedName, candidate: Candidate, otherTitles: string[] = []): boolean {
  const titles = [candidate.title, candidate.originalTitle, ...otherTitles].filter(Boolean);
  if (!titles.some((t) => sameTitle(release.title, t))) return false;
  if (release.year === null || candidate.year === null) return true;
  const exact = titles.some((t) => words(t).join("") === words(release.title).join(""));
  return Math.abs(release.year - candidate.year) <= (exact ? 3 : 1);
}

// "Die Bruecke" as TMDB spells it: "Die Brücke". Only for a second search
// attempt; the result still has to fit the release name.
export const withUmlauts = (title: string) =>
  title.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü").replace(/Ae/g, "Ä").replace(/Oe/g, "Ö").replace(/Ue/g, "Ü");

// The release name's title as a readable fallback: "The OutLaws".
export const displayTitle = (parsed: ParsedName) => parsed.title.replace(/\s+-\s+/g, " - ").trim();

// What a title shows (see title_matches in lib/db.ts), worked out from its
// release names: a decision made by hand first, then xREL's candidate if it
// fits (by any title TMDB lists for it), then a TMDB search by the name's
// title and year — taken only if a hit fits too, and only if it's the one
// hit that does when the name has no year. Otherwise nothing from TMDB.
// lookup: TMDB calls (none without an API key); their errors propagate.

export type MatchEntry = Candidate & {
  mediaType: "movie" | "tv";
  tmdbId: number;
  posterPath: string | null;
};

export type TitleLookup = {
  otherTitles: (entry: MatchEntry) => Promise<string[]>;
  search: (kind: "movie" | "tv", query: string, year: number | null) => Promise<MatchEntry[]>;
};

export type MatchDecision = {
  status: "verified" | "searched" | "unverified" | "confirmed" | "rejected";
  entry: MatchEntry | null;
  // Title and year from the release name, for when entry is null.
  fallback: { title: string; year: number | null };
};

export async function decideMatch(
  title: { type: string; names: string[]; candidate: MatchEntry | null; verdict: "wrong" | "xrel" | null },
  lookup: TitleLookup | null
): Promise<MatchDecision> {
  const names = title.names.map(parseReleaseName);
  const fallback = { title: displayTitle(names[0]), year: names[0].year };
  const fits = (entry: Candidate, others: string[] = []) => names.some((n) => fitsRelease(n, entry, others));
  const { candidate, verdict } = title;

  if (verdict === "wrong") return { status: "rejected", entry: null, fallback };
  if (verdict === "xrel" && candidate) return { status: "confirmed", entry: candidate, fallback };
  if (candidate && fits(candidate)) return { status: "verified", entry: candidate, fallback };
  if (!lookup) return { status: "unverified", entry: null, fallback };

  // Release groups often name a film by another of its titles
  // ("Neuneinhalb.Wochen" for 9½ Wochen); those TMDB lists count too.
  if (candidate && fits(candidate, await lookup.otherTitles(candidate))) {
    return { status: "verified", entry: candidate, fallback };
  }

  if (fallback.title) {
    const kind = title.type === "tv" ? "tv" : "movie";
    let hits = (await lookup.search(kind, fallback.title, fallback.year)).filter((e) => fits(e));
    // Release names spell umlauts out ("Die.Bruecke"); TMDB's search doesn't
    // always match that.
    if (!hits.length && withUmlauts(fallback.title) !== fallback.title) {
      hits = (await lookup.search(kind, withUmlauts(fallback.title), fallback.year)).filter((e) => fits(e));
    }
    if (hits.length && (fallback.year !== null || hits.length === 1)) {
      return { status: "searched", entry: hits[0], fallback };
    }
  }
  return { status: "unverified", entry: null, fallback };
}
