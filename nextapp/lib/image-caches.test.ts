import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getTmdbImage, isTmdbImageFile, pruneTmdbImages } from "./tmdb-image-cache";
import { imageResponse } from "./file-cache";
import { mockFetch } from "@/test/http";

// DATA_DIR is a throwaway directory for the whole run (vitest.config.mts);
// each test starts with the cache empty.
const dataDir = process.env.DATA_DIR!;
const tmdbDir = path.join(dataDir, "tmdb-images");
beforeEach(() => {
  fs.rmSync(tmdbDir, { recursive: true, force: true });
});

const image = (bytes: string, type = "image/jpeg") => new Response(bytes, { headers: { "Content-Type": type } });

describe("TMDB image cache", () => {
  it("fetches a poster once per size, then serves it from disk", async () => {
    const fetch = mockFetch((url) => (url.hostname === "image.tmdb.org" ? image("poster") : undefined));
    await getTmdbImage("w342", "abc.jpg");
    const again = await getTmdbImage("w342", "abc.jpg");
    await getTmdbImage("w185", "abc.jpg");
    expect(again?.type).toBe("image/jpeg");
    expect(fetch.mock.calls.map(([u]) => String(u))).toEqual([
      "https://image.tmdb.org/t/p/w342/abc.jpg",
      "https://image.tmdb.org/t/p/w185/abc.jpg",
    ]);
  });

  it("accepts only TMDB-style file names", () => {
    expect(isTmdbImageFile("dXNAPwY7VrqMAo51EKhhCJfaGb5.jpg")).toBe(true);
    expect(isTmdbImageFile("../session-secret")).toBe(false);
    expect(isTmdbImageFile("a.svg")).toBe(false);
  });

  it("prunes unreferenced posters once they're a month old", async () => {
    mockFetch(() => image("x"));
    for (const f of ["referenced.jpg", "old.jpg", "recent.jpg"]) await getTmdbImage("w342", f);
    const fortyDaysAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    for (const f of ["referenced.jpg", "old.jpg"])
      fs.utimesSync(path.join(tmdbDir, "w342", f), fortyDaysAgo, fortyDaysAgo);

    expect(await pruneTmdbImages(new Set(["/referenced.jpg"]))).toBe(1);
    expect(fs.readdirSync(path.join(tmdbDir, "w342")).sort()).toEqual(["recent.jpg", "referenced.jpg"]);
  });
});

describe("imageResponse", () => {
  it("serves bytes as immutable, private to the browser", async () => {
    const res = imageResponse({ body: Buffer.from("x"), type: "image/png" });
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Cache-Control")).toBe("private, max-age=31536000, immutable");
    expect(imageResponse(null).status).toBe(404);
  });
});
