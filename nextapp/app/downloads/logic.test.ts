import { describe, expect, it } from "vitest";
import type { DownloadFileItem, DownloadPackageItem } from "@/lib/api-types";
import {
  canPauseAll,
  canResumeAll,
  displayName,
  errorLine,
  groups,
  headline,
  isActive,
  libraryBadge,
  partProblem,
  queueTiles,
  statusLabel,
  summarize,
  timeLeft,
} from "./logic";

const MB = 1024 ** 2;

const file = (id: number, over: Partial<DownloadFileItem> = {}): DownloadFileItem => ({
  id,
  name: `part${id}.rar`,
  url: "",
  size: 100 * MB,
  received: 0,
  status: "queued",
  error: null,
  speed: null,
  inLibrary: false,
  ...over,
});

const pkg = (
  id: number,
  status: DownloadPackageItem["status"],
  over: Partial<DownloadPackageItem> = {},
): DownloadPackageItem => ({
  id,
  name: `Pkg.${id}`,
  dir: `Pkg.${id}`,
  status,
  error: null,
  createdAt: `2026-10-0${id}T00:00:00.000Z`,
  startedAt: null,
  finishedAt: null,
  media: null,
  matched: true,
  library: null,
  sources: [],
  outputs: [],
  extractPercent: null,
  files: [],
  ...over,
});

describe("summarize", () => {
  it("adds up the files, leaving skipped ones out", () => {
    const s = summarize(
      pkg(1, "downloading", {
        files: [
          file(1, { status: "done", received: 100 * MB }),
          file(2, { status: "downloading", received: 50 * MB, speed: 10 * MB }),
          file(3, { status: "skipped" }),
        ],
      }),
    );
    expect(s).toMatchObject({ received: 150 * MB, total: 200 * MB, fraction: 0.75, speed: 10 * MB });
    expect(s).not.toHaveProperty("doneFiles");
    expect(s).not.toHaveProperty("failedFiles");
  });

  it("moves the bar before every size is known, taking the rest as the known ones' average", () => {
    const s = summarize(
      pkg(1, "paused", {
        files: [
          file(1, { received: 50 * MB }),
          file(2, { received: 25 * MB }),
          file(3, { size: null }),
          file(4, { size: null }),
        ],
      }),
    );
    expect(s).toMatchObject({ received: 75 * MB, total: null, estimate: 400 * MB });
    expect(s.fraction).toBeCloseTo(75 / 400);
  });

  it("falls back to files done when no size is known", () => {
    const s = summarize(
      pkg(1, "downloading", { files: [file(1, { size: null, status: "done" }), file(2, { size: null })] }),
    );
    expect(s).toMatchObject({ estimate: null, fraction: 0.5 });
  });
});

describe("timeLeft", () => {
  it("says minutes, then hours and minutes, and nothing without speed", () => {
    expect(timeLeft(30 * MB, MB)).toBe("1 min");
    expect(timeLeft(4500 * MB, MB)).toBe("1 h 15 min");
    expect(timeLeft(MB, 0)).toBeNull();
  });
});

describe("statusLabel", () => {
  it("names the state alone, the share done being in Progress", () => {
    expect(statusLabel(pkg(1, "pending"))).toBe("Ready");
    expect(statusLabel(pkg(1, "queued"))).toBe("Waiting");
    expect(statusLabel(pkg(1, "paused"))).toBe("Paused");
    expect(statusLabel(pkg(1, "done"))).toBe("Done");
  });
});

describe("groups", () => {
  it("splits the list into New, Running (failed first) and Finished, leaving empty ones out", () => {
    const list = [pkg(1, "done"), pkg(2, "downloading"), pkg(3, "failed"), pkg(4, "pending")];
    expect(groups(list).map((g) => [g.title, g.packages.map((p) => p.id)])).toEqual([
      ["New", [4]],
      ["Running", [3, 2]],
      ["Finished", [1]],
    ]);
    expect(groups([pkg(1, "done")]).map((g) => g.title)).toEqual(["Finished"]);
  });
});

describe("headline", () => {
  it("counts what's where, or says what the page does", () => {
    expect(headline([pkg(1, "pending"), pkg(2, "downloading"), pkg(3, "paused")])).toBe(
      "1 new · 1 downloading · 1 paused",
    );
    expect(headline([])).toMatch(/^Fetches DLC containers/);
  });
});

describe("queueTiles", () => {
  it("has the packages, speed, what's left and free space, a zero muted", () => {
    const tiles = queueTiles({
      packages: [
        pkg(1, "downloading", {
          files: [file(1, { status: "downloading", received: 40 * MB, speed: 2 * MB }), file(2)],
        }),
      ],
      freeBytes: 500 * 1024 ** 3,
      downloadDir: "/downloads",
    });
    expect(tiles.map((t) => [t.label, t.value, t.hint, Boolean(t.muted)])).toEqual([
      ["Packages", "1", "1 running", false],
      ["Speed", "2,00 MB/s", "1 file coming in", false],
      ["Left", "160,00 MB", "about 2 min at this speed", false],
      ["Free space", "500,00 GB", "in /downloads", false],
    ]);
    const empty = queueTiles({ packages: [], freeBytes: null, downloadDir: "/d" });
    expect(empty[0]).toMatchObject({ value: "0", hint: "none yet", muted: true });
    expect(empty[1]).toMatchObject({ value: "0 B/s", muted: true });
  });
});

describe("libraryBadge", () => {
  it("says what the library has of a movie or a show's parts, with your copies on hover", () => {
    expect(
      libraryBadge(
        pkg(1, "pending", {
          media: { type: "movie" } as never,
          library: { have: ["1080p · x265 · FuN"], parts: 0, partsOwned: 0, season: null },
        }),
      ),
    ).toEqual({ label: "In library", hint: "You have: 1080p · x265 · FuN" });
    expect(libraryBadge(pkg(1, "pending", { library: { have: [], parts: 10, partsOwned: 4, season: null } }))).toEqual({
      label: "4 of 10 in library",
      hint: "",
    });
    expect(libraryBadge(pkg(1, "pending"))).toBeNull();
  });
});

describe("errorLine", () => {
  it("takes the first line's reason without its file name, counting the rest", () => {
    expect(errorLine("a.part1.rar: File not found")).toBe("File not found");
    expect(errorLine("a.part1.rar: File not found\na.part2.rar: Timeout\na.part3.rar: Timeout")).toBe(
      "File not found +2",
    );
    expect(errorLine("7-Zip (7zz) isn't installed")).toBe("7-Zip (7zz) isn't installed");
  });

  it("says Failed without an error", () => {
    expect(errorLine(null)).toBe("Failed");
    expect(errorLine("")).toBe("Failed");
  });
});

describe("partProblem", () => {
  const parts = (...nums: number[]) => nums.map((n) => file(n, { name: `Heat.1995.part${n}.rar` }));

  it("names the parts the hoster has no more, with their errors on hover", () => {
    const p = pkg(1, "pending", {
      files: [...parts(1, 2), file(3, { name: "Heat.1995.part3.rar", status: "failed", error: null })],
    });
    expect(partProblem(p)).toEqual({ line: "1 part offline", detail: "Heat.1995.part3.rar: Offline" });
  });

  it("finds gaps in a multi-part RAR's numbering, counting them past two", () => {
    expect(partProblem(pkg(1, "pending", { files: parts(1, 3, 4) }))).toEqual({
      line: "part2 missing",
      detail: "part2 missing",
    });
    expect(partProblem(pkg(1, "pending", { files: parts(2, 5) }))?.line).toBe("3 parts missing");
  });

  it("puts both on one line", () => {
    const p = pkg(1, "pending", {
      files: [
        file(1, { name: "Heat.1995.part1.rar", status: "failed", error: "File not found" }),
        file(3, { name: "Heat.1995.part3.rar" }),
      ],
    });
    expect(partProblem(p)).toEqual({
      line: "1 part offline · part2 missing",
      detail: "Heat.1995.part1.rar: File not found\npart2 missing",
    });
  });

  it("is null when nothing's wrong, or once it's started", () => {
    expect(partProblem(pkg(1, "pending", { files: parts(1, 2, 3) }))).toBeNull();
    expect(partProblem(pkg(1, "pending", { files: [file(1, { name: "Heat.1995.mkv" })] }))).toBeNull();
    expect(partProblem(pkg(1, "failed", { files: parts(1, 3) }))).toBeNull();
  });
});

describe("displayName", () => {
  it("is TMDB's title and year once matched", () => {
    const p = pkg(1, "pending", {
      name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
      media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null },
    });
    expect(displayName(p)).toEqual({ title: "Heat", year: 1995 });
  });

  it("reads the title and year from the release name otherwise", () => {
    expect(displayName(pkg(1, "pending", { name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR" }))).toEqual({
      title: "Heat",
      year: 1995,
    });
  });

  it("leaves out the uploader after a dash", () => {
    expect(displayName(pkg(1, "pending", { name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR - Anna" }))).toEqual({
      title: "Heat",
      year: 1995,
    });
  });

  it("reads a show's title from a multi-season pack", () => {
    for (const name of ["Silo.S01-S02.German.DL.1080p.WEB.x264-GRP", "Silo.S01+S02+S03.German.DL.1080p.WEB.x264-GRP"])
      expect(displayName(pkg(1, "pending", { name })).title).toBe("Silo");
  });

  it("is the package's name when the release name has no title", () => {
    expect(displayName(pkg(1, "pending", { name: "" })).title).toBe("");
    expect(displayName(pkg(1, "pending", { name: "links" }))).toEqual({ title: "links", year: null });
  });
});

describe("canPauseAll, canResumeAll and isActive", () => {
  const all = (...statuses: DownloadPackageItem["status"][]) => statuses.map((s, i) => pkg(i + 1, s));

  it("can pause all while a package waits or downloads", () => {
    expect(canPauseAll(all("queued"))).toBe(true);
    expect(canPauseAll(all("done", "downloading"))).toBe(true);
    expect(canPauseAll(all("pending", "paused", "extracting", "done", "failed"))).toBe(false);
    expect(canPauseAll([])).toBe(false);
  });

  it("can resume all while a package is paused", () => {
    expect(canResumeAll(all("done", "paused"))).toBe(true);
    expect(canResumeAll(all("pending", "queued", "downloading", "extracting", "done", "failed"))).toBe(false);
  });

  it("is active while a package waits, downloads or extracts", () => {
    for (const status of ["queued", "downloading", "extracting"] as const) expect(isActive(all(status))).toBe(true);
    expect(isActive(all("pending", "paused", "done", "failed"))).toBe(false);
    expect(isActive([])).toBe(false);
  });
});
