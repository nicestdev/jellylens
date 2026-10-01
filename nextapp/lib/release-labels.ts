import type { MatchInfo } from "./api-types";
import { plural } from "./format";

// How xREL releases and their matches read, on the Releases page's tiles
// and in the release panel (components/release-panel.tsx), which Requests
// and Missing open too.

// xREL's category ("HD-1080p") as shown ("1080p").
export const qualityLabel = (v: string) => v.replace(/^HD-/, "");

// "2010 · 3 releases" under the poster and in the panel. releases: left out
// while it isn't known yet (a panel opened from Requests or Missing, before
// it has loaded).
export const titleMeta = (t: { year: number | null; releases?: number }) =>
  [t.year, t.releases === undefined ? null : plural(t.releases, "release")].filter(Boolean).join(" · ");

// The one badge for the favorite groups that have released a title
// (Requests, Missing), A→Z: "VECTOR", "FuN +2"; hovered, all of them.
export const releasedLabel = (groups: string[]) =>
  groups.length > 1 ? `${groups[0]} +${groups.length - 1}` : (groups[0] ?? "");
export const releasedHint = (groups: string[]) => `Released by ${groups.join(", ")}`;

// Why the tile shows what it shows, when that isn't simply xREL's match.
export function matchNote(match: MatchInfo): string | null {
  switch (match.status) {
    case "searched":
      return "Found on TMDB by its release name; xREL linked it to something else.";
    case "unverified":
      return match.candidate
        ? "Not matched: xREL's link doesn't fit the release name."
        : "Not matched: TMDB doesn't know this title.";
    case "confirmed":
      return "xREL's match, confirmed by you.";
    case "rejected":
      return "Marked as a wrong match by you.";
    default:
      return null;
  }
}

const withYear = (t: { title: string; year: number | null }) => (t.year ? `${t.title} (${t.year})` : t.title);

// The panel's ⋯ menu for fixing a match by hand: drop TMDB's data, take
// xREL's link after all, or go back to the automatic check.
export function matchActions(match: MatchInfo): { label: string; verdict: MatchInfo["verdict"] }[] {
  const actions: { label: string; verdict: MatchInfo["verdict"] }[] = [];
  if (match.status === "verified" || match.status === "searched") {
    actions.push({ label: "Wrong match", verdict: "wrong" });
  }
  if ((match.status === "unverified" || match.status === "rejected") && match.candidate) {
    actions.push({ label: `Use xREL's match: ${withYear(match.candidate)}`, verdict: "xrel" });
  }
  if (match.verdict) actions.push({ label: "Match automatically", verdict: null });
  return actions;
}
