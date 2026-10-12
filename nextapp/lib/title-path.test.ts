import { describe, expect, it } from "vitest";
import { tileKeyOf, titlePath } from "./title-path";

describe("titlePath", () => {
  it("makes a TMDB tile's path, or an xREL title key's", () => {
    expect(titlePath("movie:949")).toBe("/title/movie/949");
    expect(titlePath("tv:1399")).toBe("/title/tv/1399");
    expect(titlePath("heat~1995")).toBe("/title/xrel/heat~1995");
    expect(titlePath("a/b c")).toBe("/title/xrel/a%2Fb%20c");
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
