import type { WcxMirror, WcxRelease, WcxSource } from "./api-types";

// Which of a release's mirrors to take: on Check, the server tries them
// in this order and adds the first online one. RG first, for
// Real-Debrid's free traffic, then DD (the own account), then the rest
// A–Z; per hoster a hide.cx container (every part, all checked) before
// WCX's plain links (only the first checked, gone after a re-upload).
// filecrypt only when nothing else works: it needs a captcha, so it's
// opened for its DLC, never checked.

const HOSTERS = ["rapidgator.net", "ddownload.com"];
const hosterRank = (hoster: string) => {
  const i = HOSTERS.indexOf(hoster);
  return i < 0 ? HOSTERS.length : i;
};
const SOURCE_RANK: Record<WcxSource, number> = { "hide.cx": 0, wcx: 1, filecrypt: 2 };

export function byPreference(a: WcxMirror, b: WcxMirror): number {
  return (
    hosterRank(a.hoster) - hosterRank(b.hoster) ||
    a.hoster.localeCompare(b.hoster) ||
    SOURCE_RANK[a.source] - SOURCE_RANK[b.source]
  );
}

type MirrorPick = { release: WcxRelease; mirror: WcxMirror };

const picks = (copies: WcxRelease[]): MirrorPick[] =>
  copies
    .flatMap((release) => release.mirrors.map((mirror) => ({ release, mirror })))
    .sort((a, b) => byPreference(a.mirror, b.mirror));

// What's worth checking, of every copy of one release (WCX lists some
// more than once), in order: what can be fetched (an account or
// Real-Debrid for its hoster), no filecrypt. A hide.cx container without
// a route stays: it has one once its links are read, plain WCX links of
// its hoster or not.
export const candidates = (copies: WcxRelease[]): MirrorPick[] =>
  picks(copies).filter(
    ({ mirror }) => mirror.source !== "filecrypt" && (mirror.route !== null || mirror.source === "hide.cx"),
  );
