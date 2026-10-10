import { describe, expect, it } from "vitest";
import type { DownloadFileItem, DownloadPackageItem } from "@/lib/api-types";
import {
  canPauseAll,
  canResumeAll,
  displayName,
  errorLine,
  groups,
  isActive,
  libraryBadge,
  partCheck,
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
  checked: "online",
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
  movedTo: null,
  movedAt: null,
  movedFiles: null,
  replaced: false,
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
    expect(timeLeft(30 * MB, MB)).toBe("1\u202fmin");
    expect(timeLeft(4500 * MB, MB)).toBe("1\u202fh 15\u202fmin");
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

  it("leaves a finished one moved into the library to Organize's list", () => {
    const moved = pkg(2, "done", { movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]" });
    expect(groups([pkg(1, "done"), moved]).map((g) => [g.title, g.packages.map((p) => p.id)])).toEqual([
      ["Finished", [1]],
    ]);
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
      ["Speed", "2.00\u202fMB/s", "1 file coming in", false],
      ["Left", "160.00\u202fMB", "about 2\u202fmin at this speed", false],
      ["Free space", "500.00\u202fGB", "in /downloads", false],
    ]);
    const empty = queueTiles({ packages: [], freeBytes: null, downloadDir: "/d" });
    expect(empty[0]).toMatchObject({ value: "0", hint: "none yet", muted: true });
    expect(empty[1]).toMatchObject({ value: "0\u202fB/s", muted: true });
  });
});

describe("libraryBadge", () => {
  it("says what the library has of a movie or a show's parts, with your copies on hover", () => {
    expect(
      libraryBadge(
        pkg(1, "pending", {
          media: { type: "movie" } as never,
          library: { have: ["FuN · 1080p · x265"], exact: 0, parts: 0, partsOwned: 0, season: null },
        }),
      ),
    ).toEqual({ label: "In library", hint: "FuN · 1080p · x265", exact: false });
    expect(
      libraryBadge(pkg(1, "pending", { library: { have: [], exact: 0, parts: 10, partsOwned: 4, season: null } })),
    ).toEqual({ label: "4 of 10 in library", hint: "", exact: false });
    expect(libraryBadge(pkg(1, "pending"))).toBeNull();
  });

  it("says when the library has this very release", () => {
    const library = (over: object) => ({ have: [], exact: 1, parts: 0, partsOwned: 0, season: null, ...over });
    expect(libraryBadge(pkg(1, "pending", { media: { type: "movie" } as never, library: library({}) }))).toMatchObject({
      label: "This release in library",
      exact: true,
    });
    expect(libraryBadge(pkg(1, "pending", { library: library({ exact: 2, parts: 4, partsOwned: 2 }) }))?.label).toBe(
      "2 of 4 in library, all of this release",
    );
    expect(
      libraryBadge(pkg(1, "pending", { library: library({ exact: 3, season: { number: 1, episodes: 8 } }) }))?.label,
    ).toBe("S01: 8 episodes in library, 3 of this release");
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

  it("starts it like a sentence, without its closing period", () => {
    expect(errorLine("Gen.V.S01E01.mkv: the copy doesn't match the original")).toBe(
      "The copy doesn't match the original",
    );
    expect(errorLine("No season in Gen.V.Folge.1.mkv.")).toBe("No season in Gen.V.Folge.1.mkv");
  });

  it("says Failed without an error", () => {
    expect(errorLine(null)).toBe("Failed");
    expect(errorLine("")).toBe("Failed");
  });
});

describe("partCheck", () => {
  const parts = (...nums: number[]) => nums.map((n) => file(n, { name: `Heat.1995.part${n}.rar` }));

  it("says Checking until the hoster was asked about every part", () => {
    const p = pkg(1, "pending", { files: [...parts(1, 2), file(3, { name: "Heat.1995.part3.rar", checked: null })] });
    expect(partCheck(p)).toEqual({ line: "Checking · 2/3" });
  });

  it("counts the parts online, plain when all are", () => {
    expect(partCheck(pkg(1, "pending", { files: parts(1, 2, 3) }))).toEqual({ line: "Online · 3/3" });
    expect(partCheck(pkg(1, "pending", { files: [file(1, { name: "Heat.1995.mkv" })] }))).toEqual({
      line: "Online · 1/1",
    });
  });

  it("says why parts failed and how many, red, each one's reason on hover", () => {
    const failed = (n: number, error: string | null) =>
      file(n, { name: `Heat.1995.part${n}.rar`, status: "failed", error });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1, 2), failed(3, null)] }))).toEqual({
      line: "Failed · 1 part",
      hint: "Heat.1995.part3.rar: Failed",
      tone: "error",
    });
    const files = [
      ...parts(1),
      failed(2, "No account for its hoster"),
      failed(3, "No account for its hoster"),
      failed(4, "Heat.1995.part4.rar: file not found."),
    ];
    expect(partCheck(pkg(1, "pending", { files }))).toEqual({
      line: "No account for its hoster +1 · 3 parts",
      hint: [
        "Heat.1995.part2.rar: No account for its hoster",
        "Heat.1995.part3.rar: No account for its hoster",
        "Heat.1995.part4.rar: Heat.1995.part4.rar: file not found.",
      ].join("\n"),
      tone: "error",
    });
  });

  it("counts gaps in a multi-part RAR's numbering as parts, red", () => {
    expect(partCheck(pkg(1, "pending", { files: parts(1, 3, 4) }))).toEqual({ line: "Online · 3/4", tone: "error" });
    expect(partCheck(pkg(1, "pending", { files: parts(2, 5) }))).toEqual({ line: "Online · 2/5", tone: "error" });
  });

  it("is peach for parts the hoster didn't answer for, red winning", () => {
    const unknown = (n: number) => file(n, { name: `Heat.1995.part${n}.rar`, checked: "unknown" });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1, 2), unknown(3)] }))).toEqual({
      line: "Online · 2/3",
      tone: "warning",
    });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1), unknown(3)] }))).toEqual({
      line: "Online · 1/3",
      tone: "error",
    });
  });

  it("leaves out parts skipped at Start", () => {
    const p = pkg(1, "pending", { files: [...parts(1, 2), file(3, { name: "x.mkv", status: "skipped" })] });
    expect(partCheck(p)).toEqual({ line: "Online · 2/2" });
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
