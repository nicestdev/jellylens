import { describe, expect, it } from "vitest";
import type { WcxMirror, WcxRelease } from "@/lib/api-types";
import { sortMirrors } from "./title-releases";

const mirror = (hoster: string, offline = false): WcxMirror => ({
  hoster,
  source: "wcx",
  links: 1,
  route: null,
  offline,
  container: null,
});
const release = (uid: string, mirrors: WcxMirror[]): WcxRelease => ({
  uid,
  name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
  group: null,
  quality: null,
  seasons: null,
  size: null,
  createdAt: null,
  mirrors,
});

const order = (copies: WcxRelease[]) =>
  sortMirrors(copies).map(({ release, mirror }) => `${release.uid}:${mirror.hoster}${mirror.offline ? "†" : ""}`);

describe("sortMirrors", () => {
  it("puts every copy's mirrors side by side: ddownload, rapidgator, then the rest A–Z", () => {
    const a = release("a", [mirror("rapidgator.net"), mirror("nitroflare.com"), mirror("ddownload.com")]);
    const b = release("b", [mirror("katfile.com"), mirror("ddownload.com")]);
    expect(order([a, b])).toEqual([
      "a:ddownload.com",
      "b:ddownload.com",
      "a:rapidgator.net",
      "b:katfile.com",
      "a:nitroflare.com",
    ]);
  });

  it("puts a live mirror before a dead one of the same hoster", () => {
    const dead = release("dead", [mirror("ddownload.com", true), mirror("rapidgator.net")]);
    const live = release("live", [mirror("rapidgator.net", true), mirror("ddownload.com")]);
    expect(order([dead, live])).toEqual([
      "live:ddownload.com",
      "dead:ddownload.com†",
      "dead:rapidgator.net",
      "live:rapidgator.net†",
    ]);
    expect(sortMirrors([release("none", [])])).toEqual([]);
  });
});
