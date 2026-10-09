import { describe, expect, it } from "vitest";
import { onlyFilter, tileKeyOf, titlePath } from "./title-path";

describe("titlePath", () => {
  it("makes a TMDB tile's path, or an xREL title key's", () => {
    expect(titlePath("movie:949")).toBe("/title/movie/949");
    expect(titlePath("tv:1399")).toBe("/title/tv/1399");
    expect(titlePath("heat~1995")).toBe("/title/xrel/heat~1995");
    expect(titlePath("a/b c")).toBe("/title/xrel/a%2Fb%20c");
  });

  it("adds what Upgrades narrows it to, leaving out what's any", () => {
    expect(titlePath("tv:1399", { group: "FuN", tier: "1080p", codec: null, season: 2 })).toBe(
      "/title/tv/1399?group=FuN&tier=1080p&season=2",
    );
  });
});

describe("tileKeyOf", () => {
  it("reads a path back into its key, null for anything else", () => {
    expect(tileKeyOf("movie", "949")).toBe("movie:949");
    expect(tileKeyOf("xrel", "a%2Fb%20c")).toBe("a/b c");
    expect(tileKeyOf("movie", "abc")).toBeNull();
    expect(tileKeyOf("album", "1")).toBeNull();
  });
});

describe("onlyFilter", () => {
  const r = (name: string, group = "VECTOR", quality = "HD-1080p") => ({
    id: name,
    name,
    link: "",
    quality,
    publishedAt: 0,
    group,
    sizeMb: null,
  });

  it("is nothing without a group", () => {
    expect(onlyFilter(new URLSearchParams("tier=1080p"))).toBeNull();
  });

  it("keeps the group's releases in that quality and codec, and says so", () => {
    const only = onlyFilter(new URLSearchParams("group=VECTOR&tier=1080p&codec=x264"))!;
    expect(only.note).toBe("Only VECTOR's 1080p x264 releases");
    expect(only.keep(r("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR", "vector"))).toBe(true);
    expect(only.keep(r("Heat.1995.German.DL.1080p.BluRay.x264-FuN", "FuN"))).toBe(false);
    expect(only.keep(r("Heat.1995.German.DL.2160p.UHD.x264-VECTOR", "VECTOR", "HD-2160p"))).toBe(false);
    expect(only.keep(r("Heat.1995.German.DL.1080p.BluRay.x265-VECTOR"))).toBe(false);
  });

  it("keeps a season's own releases only", () => {
    const only = onlyFilter(new URLSearchParams("group=ZeroTwo&season=2"))!;
    expect(only.note).toBe("Only ZeroTwo's releases of Season 2");
    expect(only.keep(r("Silo.2023.S02E01.German.DL.2160p.WEB.H265-ZeroTwo", "ZeroTwo", "HD-2160p"))).toBe(true);
    expect(only.keep(r("Silo.2023.S01.German.DL.1080p.WEB.H264-ZeroTwo", "ZeroTwo"))).toBe(false);
  });
});
