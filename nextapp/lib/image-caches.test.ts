import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { getImage, pruneImages } from "./image-cache";
import { getTmdbImage, isTmdbImageFile, pruneTmdbImages } from "./tmdb-image-cache";
import { imageResponse } from "./file-cache";
import { mockFetch } from "@/test/http";

// DATA_DIR is a throwaway directory for the whole run (vitest.config.mts);
// each test starts with both caches empty.
const dataDir = process.env.DATA_DIR!;
const jellyfinDir = path.join(dataDir, "images");
const tmdbDir = path.join(dataDir, "tmdb-images");
beforeEach(() => {
  fs.rmSync(jellyfinDir, { recursive: true, force: true });
  fs.rmSync(tmdbDir, { recursive: true, force: true });
});

const image = (bytes: string, type = "image/jpeg") => new Response(bytes, { headers: { "Content-Type": type } });

describe("Jellyfin image cache", () => {
  const id = "a".repeat(32);

  it("fetches an image once, then serves it from disk", async () => {
    const fetch = mockFetch(() => image("poster"));
    const first = await getImage(id, "tag1", 480);
    const second = await getImage(id, "tag1", 480);
    expect(first?.body.toString()).toBe("poster");
    expect(second).toEqual(first);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync(path.join(jellyfinDir, id))).toEqual(["tag1-480.jpg"]);
    // With the API key, at the requested height.
    expect(String(fetch.mock.calls[0][0])).toContain(`/Items/${id}/Images/Primary?fillHeight=480`);
  });

  it("shares one fetch between concurrent requests", async () => {
    const fetch = mockFetch(() => image("poster"));
    await Promise.all([getImage(id, "tag1", 480), getImage(id, "tag1", 480)]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("replaces the files of an older tag", async () => {
    mockFetch(() => image("old"));
    await getImage(id, "tag1", 480);
    mockFetch(() => image("new"));
    await getImage(id, "tag2", 480);
    expect(fs.readdirSync(path.join(jellyfinDir, id))).toEqual(["tag2-480.jpg"]);
  });

  it("returns null for errors and non-images", async () => {
    mockFetch(() => new Response("", { status: 404 }));
    expect(await getImage(id, "tag1", 480)).toBeNull();
    mockFetch(() => image("<html>", "text/html"));
    expect(await getImage(id, "tag1", 480)).toBeNull();
  });

  it("prunes images of items that left the library", async () => {
    mockFetch(() => image("x"));
    await getImage(id, "t", 240);
    await getImage("b".repeat(32), "t", 240);
    expect(await pruneImages(new Set([id]))).toBe(1);
    expect(fs.readdirSync(jellyfinDir)).toEqual([id]);
  });
});

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
    for (const f of ["referenced.jpg", "old.jpg"]) fs.utimesSync(path.join(tmdbDir, "w342", f), fortyDaysAgo, fortyDaysAgo);

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
