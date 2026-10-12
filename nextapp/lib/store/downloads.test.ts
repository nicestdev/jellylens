import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addPackage,
  deletePackage,
  getPackage,
  listFiles,
  nextQueuedFile,
  pauseAllPackages,
  pausePackage,
  requeueInterrupted,
  resetPackage,
  resumeAllPackages,
  resumePackage,
  retryPackage,
  setPackageStatus,
  startPackage,
  updateFile,
  type DownloadStatus,
} from ".";

afterEach(() => {
  vi.useRealTimers();
});

// A new package with files by these names.
const add = (name: string, files: string[]) =>
  addPackage({ name, dir: name, files: files.map((f) => ({ url: `https://example.com/${f}`, name: f, size: 100 })) });

// A package in the given state (its files left queued).
function inState(status: DownloadStatus, name: string = status) {
  const id = add(name, ["a.mkv"]);
  if (status !== "pending") {
    startPackage(id);
    setPackageStatus(id, status);
  }
  return id;
}

const statusOf = (id: number) => getPackage(id)?.status;

describe("resetPackage", () => {
  it("puts a package back in New with every file from scratch, those skipped at Start too", () => {
    const id = addPackage({
      name: "The.Office.S03.German.DL.1080p.WEB.x264-VECTOR",
      dir: "The.Office.S03.German.DL.1080p.WEB.x264-VECTOR",
      files: ["e01.mkv", "e02.mkv", "e03.mkv"].map((name) => ({ url: `u/${name}`, name, size: 100 })),
    });
    const [e1, e2, e3] = listFiles(id);
    startPackage(id, [e3.id]);
    updateFile(e1.id, { status: "done", received: 100 });
    updateFile(e2.id, { status: "failed", received: 40, error: "Connection reset" });
    setPackageStatus(id, "failed", "e02.mkv: Connection reset");
    expect(getPackage(id)?.startedAt).not.toBeNull();

    resetPackage(id);
    expect(getPackage(id)).toMatchObject({ status: "pending", error: null, startedAt: null, finishedAt: null });
    expect(listFiles(id).map((f) => [f.name, f.status, f.received, f.error])).toEqual([
      ["e01.mkv", "queued", 0, null],
      ["e02.mkv", "queued", 0, null],
      ["e03.mkv", "queued", 0, null],
    ]);
  });
});

describe("startPackage", () => {
  it("queues a new package, skipping the files asked, and only its own", () => {
    const id = add("Anna", ["a.mkv", "b.mkv"]);
    const other = add("Ben", ["c.mkv"]);
    const [a] = listFiles(id);
    const [c] = listFiles(other);
    startPackage(id, [a.id, c.id]);
    expect(getPackage(id)).toMatchObject({ status: "queued" });
    expect(getPackage(id)?.startedAt).not.toBeNull();
    expect(listFiles(id).map((f) => f.status)).toEqual(["skipped", "queued"]);
    expect(listFiles(other)[0].status).toBe("queued");
  });

  it("leaves a package that isn't new as it is", () => {
    const id = inState("paused");
    const startedAt = getPackage(id)?.startedAt;
    startPackage(id);
    expect(getPackage(id)).toMatchObject({ status: "paused", startedAt });
  });
});

describe("nextQueuedFile", () => {
  it("is the first queued file of the package started first, whatever order they were added in", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const first = add("Anna", ["a1.mkv", "a2.mkv"]);
    const second = add("Ben", ["b1.mkv"]);
    startPackage(second);
    vi.setSystemTime(new Date("2026-10-01T11:00:00Z"));
    startPackage(first);
    expect(nextQueuedFile()?.name).toBe("b1.mkv");
    updateFile(listFiles(second)[0].id, { status: "downloading" });
    expect(nextQueuedFile()?.name).toBe("a1.mkv");
    updateFile(listFiles(first)[0].id, { status: "done" });
    expect(nextQueuedFile()?.name).toBe("a2.mkv");
  });

  it("goes by id when packages started at the same time", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T10:00:00Z"));
    const a = add("Anna", ["a.mkv"]);
    const b = add("Ben", ["b.mkv"]);
    startPackage(b);
    startPackage(a);
    expect(nextQueuedFile()?.name).toBe("a.mkv");
  });

  it("skips packages that are new, paused, extracting, done or failed", () => {
    for (const status of ["pending", "paused", "extracting", "done", "failed"] as const) inState(status);
    expect(nextQueuedFile()).toBeNull();
    const id = inState("downloading");
    expect(nextQueuedFile()?.packageId).toBe(id);
  });

  it("skips files that aren't queued", () => {
    const id = add("Anna", ["a.mkv", "b.mkv", "c.mkv", "d.mkv"]);
    const [a, b, c] = listFiles(id);
    startPackage(id, [a.id]);
    updateFile(b.id, { status: "failed" });
    updateFile(c.id, { status: "extracted" });
    expect(nextQueuedFile()?.name).toBe("d.mkv");
  });

  it("is null when nothing is queued", () => {
    expect(nextQueuedFile()).toBeNull();
  });
});

describe("pausePackage and resumePackage", () => {
  it("pauses only a waiting or downloading package", () => {
    const statuses: DownloadStatus[] = ["pending", "queued", "downloading", "extracting", "done", "failed", "paused"];
    const ids = statuses.map((s) => inState(s));
    for (const id of ids) pausePackage(id);
    expect(ids.map(statusOf)).toEqual(["pending", "paused", "paused", "extracting", "done", "failed", "paused"]);
  });

  it("resumes only a paused package, back into the queue", () => {
    const statuses: DownloadStatus[] = ["pending", "paused", "downloading", "failed"];
    const ids = statuses.map((s) => inState(s));
    for (const id of ids) resumePackage(id);
    expect(ids.map(statusOf)).toEqual(["pending", "queued", "downloading", "failed"]);
  });
});

describe("pauseAllPackages and resumeAllPackages", () => {
  it("pauses every waiting or downloading package, naming them, and resumes every paused one", () => {
    const statuses: DownloadStatus[] = ["pending", "queued", "downloading", "extracting", "done", "failed"];
    const ids = statuses.map((s) => inState(s));
    expect(pauseAllPackages().sort()).toEqual([ids[1], ids[2]].sort());
    expect(ids.map(statusOf)).toEqual(["pending", "paused", "paused", "extracting", "done", "failed"]);
    expect(pauseAllPackages()).toEqual([]);
    resumeAllPackages();
    expect(ids.map(statusOf)).toEqual(["pending", "queued", "queued", "extracting", "done", "failed"]);
  });
});

describe("retryPackage", () => {
  it("queues a failed package's failed files again, from where they stopped", () => {
    const id = add("Anna", ["a.mkv", "b.mkv"]);
    const [a, b] = listFiles(id);
    startPackage(id);
    updateFile(a.id, { status: "done", received: 100 });
    updateFile(b.id, { status: "failed", received: 40, error: "Timeout" });
    setPackageStatus(id, "failed", "b.mkv: Timeout");
    expect(getPackage(id)?.finishedAt).not.toBeNull();

    retryPackage(id);
    expect(getPackage(id)).toMatchObject({ status: "queued", error: null, finishedAt: null });
    expect(listFiles(id).map((f) => [f.status, f.received, f.error])).toEqual([
      ["done", 100, null],
      ["queued", 40, null],
    ]);
  });

  it("leaves a package that hasn't failed as it is", () => {
    const id = add("Ben", ["a.mkv"]);
    retryPackage(id);
    expect(getPackage(id)?.status).toBe("pending");
  });
});

describe("requeueInterrupted", () => {
  it("puts what a restart interrupted back in the queue, and leaves the rest", () => {
    const statuses: DownloadStatus[] = ["pending", "paused", "downloading", "extracting", "done", "failed"];
    const ids = statuses.map((s) => inState(s));
    const [file] = listFiles(ids[2]);
    updateFile(file.id, { status: "downloading", received: 50 });
    updateFile(listFiles(ids[1])[0].id, { status: "downloading" });
    requeueInterrupted();
    expect(ids.map(statusOf)).toEqual(["pending", "paused", "queued", "queued", "done", "failed"]);
    expect(listFiles(ids[2])[0]).toMatchObject({ status: "queued", received: 50 });
    // A file of any package, a paused one's too.
    expect(listFiles(ids[1])[0].status).toBe("queued");
  });
});

describe("setPackageStatus", () => {
  it("stamps when a package finished, done or failed, and clears it otherwise", () => {
    const id = inState("downloading");
    setPackageStatus(id, "done");
    expect(getPackage(id)?.finishedAt).not.toBeNull();
    setPackageStatus(id, "queued");
    expect(getPackage(id)).toMatchObject({ status: "queued", finishedAt: null, error: null });
  });
});

describe("deletePackage", () => {
  it("takes the package and its files away, and no other", () => {
    const id = add("Anna", ["a.mkv", "b.mkv"]);
    const other = add("Ben", ["c.mkv"]);
    deletePackage(id);
    expect(getPackage(id)).toBeNull();
    expect(listFiles(id)).toEqual([]);
    expect(listFiles().map((f) => f.name)).toEqual(["c.mkv"]);
    expect(getPackage(other)).not.toBeNull();
  });
});
