import { describe, expect, it } from "vitest";
import { facetValues, noFilters, releasesUrl } from "./releases";

describe("releasesUrl", () => {
  it("sends the trimmed search, the sort, the page and every selected value", () => {
    const filters = { ...noFilters(), group: new Set(["VECTOR", "FuN"]) };
    const url = new URL(releasesUrl(" dune ", filters, "title", "asc", 60), "http://jellylens.test");
    expect(url.pathname).toBe("/api/releases");
    expect(url.searchParams.get("q")).toBe("dune");
    expect(url.searchParams.get("sort")).toBe("title");
    expect(url.searchParams.get("dir")).toBe("asc");
    expect(url.searchParams.get("offset")).toBe("60");
    expect(url.searchParams.getAll("group")).toEqual(["VECTOR", "FuN"]);
  });
});

describe("facetValues", () => {
  it("lists the values as the server does", () => {
    expect(facetValues("group", ["VECTOR", "FuN"], new Set())).toEqual(["VECTOR", "FuN"]);
  });

  it("hides a facet with a single value unless it's in use", () => {
    expect(facetValues("group", ["FuN"], new Set())).toEqual([]);
    expect(facetValues("group", ["FuN"], new Set(["FuN"]))).toEqual(["FuN"]);
  });
});
