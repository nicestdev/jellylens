import { describe, expect, it } from "vitest";
import type { WcxMirror, WcxRelease, WcxSource } from "@/lib/api-types";
import { byPreference, candidates } from "./mirrors";

const mirror = (hoster: string, source: WcxSource = "wcx", route: string | null = "realdebrid"): WcxMirror => ({
  hoster,
  source,
  links: 1,
  route,
  offline: false,
  container: null,
});
const release = (uid: string, mirrors: WcxMirror[]): WcxRelease => ({
  uid,
  name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
  group: null,
  quality: null,
  seasons: null,
  seasonEpisodes: null,
  size: null,
  createdAt: null,
  mirrors,
});

const label = (m: WcxMirror) => `${m.hoster}/${m.source}`;

describe("byPreference", () => {
  it("takes rapidgator, then ddownload, then the rest A–Z; per hoster hide.cx, WCX, filecrypt", () => {
    const sorted = [
      mirror("nitroflare.com"),
      mirror("ddownload.com", "filecrypt"),
      mirror("katfile.com"),
      mirror("ddownload.com", "wcx"),
      mirror("rapidgator.net", "wcx"),
      mirror("ddownload.com", "hide.cx"),
      mirror("rapidgator.net", "hide.cx"),
    ].sort(byPreference);
    expect(sorted.map(label)).toEqual([
      "rapidgator.net/hide.cx",
      "rapidgator.net/wcx",
      "ddownload.com/hide.cx",
      "ddownload.com/wcx",
      "ddownload.com/filecrypt",
      "katfile.com/wcx",
      "nitroflare.com/wcx",
    ]);
  });
});

describe("candidates", () => {
  it("merges every copy's mirrors in order and leaves out filecrypt and what can't be fetched", () => {
    const a = release("a", [mirror("ddownload.com"), mirror("rapidgator.net", "filecrypt")]);
    const b = release("b", [mirror("katfile.com", "wcx", null), mirror("rapidgator.net")]);
    expect(candidates([a, b]).map(({ release, mirror }) => `${release.uid}:${label(mirror)}`)).toEqual([
      "b:rapidgator.net/wcx",
      "a:ddownload.com/wcx",
    ]);
    expect(candidates([release("none", [])])).toEqual([]);
  });
});
