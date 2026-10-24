import { describe, expect, it } from "vitest";
import type { DownloadFileItem, DownloadPackageItem, OrganizeItem, OrganizeMoved } from "@/lib/api-types";
import {
  canPauseAll,
  canResumeAll,
  displayName,
  errorLine,
  isActive,
  partCheck,
  queueLine,
  sections,
  STATUS_LABEL,
  startable,
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
  choice: null,
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

describe("STATUS_LABEL", () => {
  it("names a moving package's state alone", () => {
    expect(STATUS_LABEL.queued).toBe("Waiting");
    expect(STATUS_LABEL.paused).toBe("Paused");
    expect(STATUS_LABEL.extracting).toBe("Extracting");
  });
});

const item = (id: number, over: Partial<OrganizeItem> = {}): OrganizeItem => ({
  id,
  name: `Heat.${id}`,
  media: null,
  folder: "Heat (1995) [tmdbid-949]",
  files: ["Heat.mkv"],
  bytes: 1e9,
  error: null,
  targets: [],
  owned: [],
  move: null,
  ...over,
});
const moved = (id: number, over: Partial<OrganizeMoved> = {}): OrganizeMoved => ({
  id,
  name: `Heat.${id}`,
  media: null,
  movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]",
  movedAt: "2026-10-09T10:00:00.000Z",
  files: ["Heat.mkv"],
  bytes: 1e9,
  replaced: false,
  ...over,
});
const organize = (items: OrganizeItem[], movedItems: OrganizeMoved[] = []) => ({
  ready: true,
  libraryDir: "/library",
  disks: [],
  items,
  moved: movedItems,
});
const ids = (list: { id: number }[]) => list.map((x) => x.id);

describe("sections", () => {
  it("splits the queue into Needs attention, Downloading, Ready to organize and Done, leaving empty ones out", () => {
    const packages = [pkg(1, "done"), pkg(2, "downloading"), pkg(3, "failed"), pkg(4, "pending"), pkg(5, "paused")];
    const list = sections(packages, organize([item(1), item(6, { error: "No season" })], [moved(7)]));
    expect(list.map((s) => [s.title, ids(s.packages), ids(s.items), ids(s.moved), ids(s.pending)])).toEqual([
      ["Needs attention", [3], [6], [], [4]],
      ["Downloading", [2, 5], [], [], []],
      ["Ready to organize", [], [1], [], []],
      ["Done", [], [], [7], []],
    ]);
    expect(sections([pkg(1, "downloading")], null).map((s) => s.title)).toEqual(["Downloading"]);
  });

  it("puts a move that failed under Needs attention", () => {
    const error = {
      target: "/library/nvme02/movies",
      done: 0,
      total: 1,
      speed: 0,
      running: false,
      error: "Disk full",
    };
    const list = sections([], organize([item(1, { move: error })]));
    expect(list.map((s) => [s.title, ids(s.items)])).toEqual([["Needs attention", [1]]]);
  });

  it("starts Downloading in queue order, by when each started", () => {
    const list = sections(
      [
        pkg(1, "queued", { startedAt: "2026-10-09T12:00:00.000Z" }),
        pkg(2, "downloading", { startedAt: "2026-10-09T10:00:00.000Z" }),
      ],
      null,
    );
    expect(ids(list[0].packages)).toEqual([2, 1]);
  });
});

describe("queueLine", () => {
  it("has speed, what's left and how long while something comes in, free space always", () => {
    const packages = [
      pkg(1, "downloading", {
        files: [file(1, { status: "downloading", received: 40 * MB, speed: 2 * MB }), file(2)],
      }),
      pkg(2, "failed"),
    ];
    expect(queueLine({ packages, freeBytes: 500 * 1024 ** 3 })).toEqual([
      { label: "Speed", value: "2.00\u202fMB/s" },
      { label: "Left", value: "160.00\u202fMB" },
      { label: "Time left", value: "2\u202fmin" },
      { label: "Free", value: "500.00\u202fGB" },
    ]);
    expect(queueLine({ packages: [], freeBytes: null })).toEqual([{ label: "Free", value: "?" }]);
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
    expect(partCheck(p)).toEqual({ line: ["Checking", "2/3"], checking: true });
  });

  it("counts the parts online, plain when all are", () => {
    expect(partCheck(pkg(1, "pending", { files: parts(1, 2, 3) }))).toEqual({ line: ["Online", "3/3"] });
    expect(partCheck(pkg(1, "pending", { files: [file(1, { name: "Heat.1995.mkv" })] }))).toEqual({
      line: ["Online", "1/1"],
    });
  });

  it("says why parts failed and how many, red", () => {
    const failed = (n: number, error: string | null) =>
      file(n, { name: `Heat.1995.part${n}.rar`, status: "failed", error });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1, 2), failed(3, null)] }))).toEqual({
      line: ["Failed", "1 part"],
      tone: "error",
    });
    const files = [
      ...parts(1),
      failed(2, "No account for its hoster"),
      failed(3, "No account for its hoster"),
      failed(4, "Heat.1995.part4.rar: file not found."),
    ];
    expect(partCheck(pkg(1, "pending", { files }))).toEqual({
      line: ["No account for its hoster +1", "3 parts"],
      tone: "error",
    });
  });

  it("counts gaps in a multi-part RAR's numbering as parts, red", () => {
    expect(partCheck(pkg(1, "pending", { files: parts(1, 3, 4) }))).toEqual({
      line: ["Online", "3/4"],
      tone: "error",
    });
    expect(partCheck(pkg(1, "pending", { files: parts(2, 5) }))).toEqual({
      line: ["Online", "2/5"],
      tone: "error",
    });
  });

  it("is peach for parts the hoster didn't answer for, red winning", () => {
    const unknown = (n: number) => file(n, { name: `Heat.1995.part${n}.rar`, checked: "unknown" });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1, 2), unknown(3)] }))).toEqual({
      line: ["Online", "2/3"],
      tone: "warning",
    });
    expect(partCheck(pkg(1, "pending", { files: [...parts(1), unknown(3)] }))).toEqual({
      line: ["Online", "1/3"],
      tone: "error",
    });
  });

  it("leaves out parts skipped at Start", () => {
    const p = pkg(1, "pending", { files: [...parts(1, 2), file(3, { name: "x.mkv", status: "skipped" })] });
    expect(partCheck(p)).toEqual({ line: ["Online", "2/2"] });
  });
});

describe("displayName", () => {
  it("is TMDB's title once matched", () => {
    const p = pkg(1, "pending", {
      name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
      media: { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null },
    });
    expect(displayName(p)).toBe("Heat");
  });

  it("reads the title from the release name otherwise", () => {
    expect(displayName(pkg(1, "pending", { name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR" }))).toBe("Heat");
  });

  it("leaves out the uploader after a dash", () => {
    expect(displayName(pkg(1, "pending", { name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR - Anna" }))).toBe(
      "Heat",
    );
  });

  it("reads a show's title from a multi-season pack", () => {
    for (const name of ["Silo.S01-S02.German.DL.1080p.WEB.x264-GRP", "Silo.S01+S02+S03.German.DL.1080p.WEB.x264-GRP"])
      expect(displayName(pkg(1, "pending", { name }))).toBe("Silo");
  });

  it("is the package's name when the release name has no title", () => {
    expect(displayName(pkg(1, "pending", { name: "" }))).toBe("");
    expect(displayName(pkg(1, "pending", { name: "links" }))).toBe("links");
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

it("starts every new one, the library's as their ⋯ offers first", () => {
  const lib = (choices: ("replace" | "skip")[]) =>
    ({ old: [], new: [], exact: false, skip: 0, choices, disks: [], presumed: [] }) as DownloadPackageItem["library"];
  const list = [
    pkg(1, "pending"),
    pkg(2, "pending", { library: lib(["replace"]) }),
    pkg(3, "pending", { library: lib(["skip"]) }),
    pkg(4, "pending", { library: lib([]) }),
    pkg(5, "downloading"),
  ];
  expect(startable(list).map(({ pkg, choice }) => [pkg.id, choice])).toEqual([
    [1, undefined],
    [2, "replace"],
    [3, "skip"],
  ]);
});
