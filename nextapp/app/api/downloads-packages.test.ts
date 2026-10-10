import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import { show } from "@/test/fixtures";
import { storedFiles } from "@/lib/analytics";
import { DOWNLOAD_DIR } from "@/lib/env";
import {
  addPackage,
  getPackage,
  listFiles,
  listPackages,
  replaceLibrary,
  setPackageMedia,
  setPackageStatus,
  updateFile,
} from "@/lib/store";

// POST and GET /api/downloads, DELETE and POST /api/downloads/[id]. The
// accounts are read from `env` as they're used, DOWNLOAD_DIR is a throwaway
// folder, a DLC's decryption is mocked, and nothing downloads (the queue's
// kick and settle are stubbed) or is looked up in the background.
const env = vi.hoisted(() => ({ DDOWNLOAD_LOGIN: "", DDOWNLOAD_PASSWORD: "", REALDEBRID_TOKEN: "" }));
vi.mock("@/lib/env", async (original) => {
  const fsp = await import("node:fs");
  const os = await import("node:os");
  const p = await import("node:path");
  const mocked = {
    ...(await original<typeof import("@/lib/env")>()),
    DOWNLOAD_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-downloads-")),
  };
  for (const key of Object.keys(env) as (keyof typeof env)[]) {
    Object.defineProperty(mocked, key, { get: () => env[key], enumerable: true });
  }
  return mocked;
});
const dlc = vi.hoisted(() => ({ decryptDlc: vi.fn() }));
vi.mock("@/lib/dlc", () => dlc);
vi.mock("@/lib/download-match", async (original) => ({
  ...(await original<typeof import("@/lib/download-match")>()),
  matchPendingPackages: () => {},
  checkPendingFiles: () => {},
}));
const queue = vi.hoisted(() => ({ kickDownloads: vi.fn(), settlePackage: vi.fn() }));
vi.mock("@/lib/downloader", async (original) => ({
  ...(await original<typeof import("@/lib/downloader")>()),
  ...queue,
}));

beforeEach(() => {
  Object.assign(env, { DDOWNLOAD_LOGIN: "", DDOWNLOAD_PASSWORD: "", REALDEBRID_TOKEN: "" });
  queue.kickDownloads.mockClear();
  queue.settlePackage.mockClear();
  dlc.decryptDlc.mockReset();
});
afterEach(() => {
  for (const entry of fs.readdirSync(DOWNLOAD_DIR)) fs.rmSync(path.join(DOWNLOAD_DIR, entry), { recursive: true });
});
afterAll(() => fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true }));

const withDdownload = () => Object.assign(env, { DDOWNLOAD_LOGIN: "anna", DDOWNLOAD_PASSWORD: "secret" });
// Real-Debrid covering rapidgator.net (its hoster list is public, no token).
const withRealDebrid = () => {
  env.REALDEBRID_TOKEN = "rd-token";
  return mockFetch((url) =>
    url.hostname === "api.real-debrid.com" && url.pathname === "/rest/1.0/hosts/domains"
      ? json(["rapidgator.net", "rg.to"])
      : undefined,
  );
};

const DD1 = "https://ddownload.com/aaaaaaaaaaa1/Show.S01.German.1080p.WEB.x264-GRP.part1.rar";
const DD2 = "https://ddownload.com/aaaaaaaaaaa2/Show.S01.German.1080p.WEB.x264-GRP.part2.rar";
const RG = "https://rapidgator.net/file/00000000000000a1/Show.S01.German.1080p.WEB.x264-GRP.part3.rar";
const OTHER = "https://example.com/file/Show.S01.German.1080p.WEB.x264-GRP.part4.rar";

const route = () => import("./downloads/route");
const postForm = async (fields: { links?: string; containers?: File[] }) => {
  const form = new FormData();
  if (fields.links !== undefined) form.set("links", fields.links);
  for (const f of fields.containers ?? []) form.append("containers", f);
  const res = await (
    await route()
  ).POST(new Request("http://jellylens.test/api/downloads", { method: "POST", body: form }));
  return { status: res.status, body: await res.json() };
};
const getDownloads = async () => (await (await route()).GET()).json();

describe("POST /api/downloads", () => {
  it("makes one package of pasted links, named after the first without .partN.rar", async () => {
    withDdownload();
    const { status, body } = await postForm({
      links: `  ${DD1}\n\nnot a link ftp://example.com/x.rar\r\n${DD2}  `,
    });
    expect(status).toBe(200);
    // The list as GET has it, the new package in it.
    expect(body.packages.map((p: { name: string }) => p.name)).toEqual(["Show.S01.German.1080p.WEB.x264-GRP"]);
    const [pkg] = listPackages();
    expect(pkg).toMatchObject({
      name: "Show.S01.German.1080p.WEB.x264-GRP",
      dir: "Show.S01.German.1080p.WEB.x264-GRP",
      status: "pending",
    });
    expect(listFiles(pkg.id).map((f) => [f.url, f.name, f.size])).toEqual([
      [DD1, "Show.S01.German.1080p.WEB.x264-GRP.part1.rar", null],
      [DD2, "Show.S01.German.1080p.WEB.x264-GRP.part2.rar", null],
    ]);
    // Nothing starts until it's started by hand.
    expect(queue.kickDownloads).not.toHaveBeenCalled();
  });

  it("strips a plain archive extension from the name too, and numbers a taken folder", async () => {
    withDdownload();
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "Movie.2020.1080p-GRP"));
    await postForm({ links: "https://ddownload.com/aaaaaaaaaaa3/Movie.2020.1080p-GRP.7z" });
    await postForm({ links: "https://ddownload.com/aaaaaaaaaaa4/Movie.2020.1080p-GRP.ZIP" });
    expect(listPackages().map((p) => [p.name, p.dir])).toEqual([
      ["Movie.2020.1080p-GRP", "Movie.2020.1080p-GRP (3)"],
      ["Movie.2020.1080p-GRP", "Movie.2020.1080p-GRP (2)"],
    ]);
  });

  it("keeps links of hosters it can't fetch, failed with why", async () => {
    withDdownload();
    withRealDebrid();
    const { body } = await postForm({ links: [DD1, RG, OTHER].join(" ") });
    expect(listFiles().map((f) => [f.url, f.status, f.error])).toEqual([
      [DD1, "queued", null],
      [RG, "queued", null],
      [OTHER, "failed", "No account for its hoster"],
    ]);
    expect(body.packages[0].sources).toEqual(["ddownload", "rapidgator.net via Real-Debrid", "no account"]);
  });

  it("says so when no hoster of the links can be fetched", async () => {
    const { status, body } = await postForm({ links: DD1 });
    expect(status).toBe(400);
    expect(body.error).toMatch(/^None of the links can be fetched: there's no account for their hoster/);
    expect(listPackages()).toEqual([]);
  });

  it("names a link it can't decode by the name as written", async () => {
    withDdownload();
    const { status } = await postForm({ links: "https://ddownload.com/aaaaaaaaaaa1/Bad%E0%A4%A.rar" });
    expect(status).toBe(200);
    expect(listPackages().map((p) => p.name)).toEqual(["Bad%E0%A4%A"]);
  });

  it("says so when there are no links at all", async () => {
    withDdownload();
    // "http://" alone isn't a link either.
    for (const links of ["", "nothing here", "ftp://example.com/a.rar", "http://"]) {
      const { status, body } = await postForm({ links });
      expect(status, links).toBe(400);
      expect(body, links).toEqual({ error: "No links found." });
    }
    expect((await postForm({})).body).toEqual({ error: "No links found." });
  });

  it("refuses a body that isn't a form", async () => {
    const res = await (
      await route()
    ).POST(
      new Request("http://jellylens.test/api/downloads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Expected a form with DLC files or links." });
  });

  it("adds a package per DLC package, named after the container if it has no name", async () => {
    withDdownload();
    dlc.decryptDlc.mockResolvedValue([
      {
        name: "Named.Package",
        files: [{ url: "https://ddownload.com/aaaaaaaaaaa5/x.rar", name: null, size: 42 }],
      },
      {
        name: "",
        files: [
          { url: "https://ddownload.com/aaaaaaaaaaa6/y.rar", name: "Given.rar", size: null },
          { url: OTHER, name: "z.rar", size: 1 },
        ],
      },
    ]);
    const { body } = await postForm({ containers: [new File(["container"], "Anna.Upload.dlc")] });
    expect(dlc.decryptDlc).toHaveBeenCalledWith("container");
    expect(body.packages).toHaveLength(2);
    const [second, first] = listPackages();
    expect(first.name).toBe("Named.Package");
    expect(listFiles(first.id).map((f) => [f.name, f.size])).toEqual([["x.rar", 42]]);
    expect(second.name).toBe("Anna.Upload");
    expect(listFiles(second.id).map((f) => [f.name, f.status])).toEqual([
      ["Given.rar", "queued"],
      ["z.rar", "failed"],
    ]);
  });

  it("names the container that didn't decrypt", async () => {
    dlc.decryptDlc.mockRejectedValue(new Error("Not a DLC container"));
    const { status, body } = await postForm({ containers: [new File(["x"], "broken.dlc")], links: DD1 });
    expect(status).toBe(400);
    expect(body).toEqual({ error: "broken.dlc: Not a DLC container" });
    expect(listPackages()).toEqual([]);
  });
});

// A show matched to TMDB 100 whose S01E01 is in the library (in 1080p by GRP).
function library() {
  replaceLibrary(
    {
      movies: [],
      shows: [show({ Id: "s1", Name: "Show" })],
      episodes: [],
      files: storedFiles([
        {
          kind: "episode",
          id: "e1",
          parentId: "s1",
          title: "Show",
          year: null,
          tmdbId: "100",
          season: 1,
          episode: 1,
          files: [
            {
              Name: "Show.S01E01.1080p.WEB.h264-GRP.mkv",
              Path: "Show.S01E01.1080p.WEB.h264-GRP.mkv",
              Size: 1,
              Codec: "h264",
              Width: 1920,
              Height: 1080,
            },
          ],
        },
      ]),
    },
    "2026-10-01T00:00:00.000Z",
  );
}
const showMedia = { type: "tv" as const, tmdbId: 100, title: "Show", year: 2020, posterPath: null };

function episodesPackage(dir = "Show.S01") {
  const id = addPackage({
    name: dir,
    dir,
    files: [
      { url: "https://ddownload.com/aaaaaaaaaab1/Show.S01E01.mkv", name: "Show.S01E01.mkv", size: 10 },
      { url: "https://ddownload.com/aaaaaaaaaab2/Show.S01E02.mkv", name: "Show.S01E02.mkv", size: 10 },
    ],
  });
  setPackageMedia(id, showMedia);
  return id;
}

describe("GET /api/downloads", () => {
  it("says where each unfinished package's files come from", async () => {
    addPackage({ name: "None", dir: "None", files: [{ url: DD1, name: "a.rar", size: null }] });
    withDdownload();
    addPackage({ name: "Mixed", dir: "Mixed", files: [{ url: DD1, name: "a.rar", size: null }] });
    const body = await getDownloads();
    expect(body.ready).toBe(true);
    expect(body.packages.map((p: { name: string; sources: string[] }) => [p.name, p.sources])).toEqual([
      ["Mixed", ["ddownload"]],
      ["None", ["ddownload"]],
    ]);
    env.DDOWNLOAD_PASSWORD = "";
    const none = await getDownloads();
    expect(none.ready).toBe(false);
    expect(none.packages[0].sources).toEqual(["no account"]);
  });

  it("says 'no account' when Real-Debrid's hoster list doesn't load", async () => {
    env.REALDEBRID_TOKEN = "rd-token";
    mockFetch(() => new Response("", { status: 503 }));
    addPackage({ name: "P", dir: "P", files: [{ url: RG, name: "a.rar", size: null }] });
    const body = await getDownloads();
    expect(body.ready).toBe(true);
    expect(body.packages[0].sources).toEqual(["no account"]);
  });

  it("marks the episodes the library has, and leaves a finished package's out", async () => {
    library();
    const open = episodesPackage();
    const done = episodesPackage("Show.S01.Done");
    setPackageStatus(done, "done");
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "Show.S01.Done", "Sub"), { recursive: true });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "Show.S01.Done", "Sub", "e.mkv"), "12345");
    const body = await getDownloads();
    const byId = new Map(body.packages.map((p: { id: number }) => [p.id, p]));
    expect(byId.get(open)).toMatchObject({
      library: { have: ["GRP · 1080p · x264"], parts: 2, partsOwned: 1, season: null },
      outputs: [],
      extractPercent: null,
      files: [
        { name: "Show.S01E01.mkv", inLibrary: true, speed: null },
        { name: "Show.S01E02.mkv", inLibrary: false, speed: null },
      ],
    });
    expect(byId.get(open)).not.toHaveProperty("files.0.packageId");
    expect(byId.get(done)).toMatchObject({
      library: null,
      sources: [],
      outputs: [{ path: "Sub/e.mkv", size: 5 }],
      files: [{ inLibrary: false }, { inLibrary: false }],
    });
  });

  it("tells the free space where packages go, and the queue's settings", async () => {
    const body = await getDownloads();
    expect(body).toMatchObject({ downloadDir: DOWNLOAD_DIR, slots: 2, maxSlots: 10, packages: [] });
    expect(body.freeBytes).toBeGreaterThan(0);
  });
});

const pkgRoute = () => import("./downloads/[id]/route");
const params = (id: number | string) => ({ params: Promise.resolve({ id: String(id) }) });
const act = async (id: number | string, body: unknown) => {
  const res = await (
    await pkgRoute()
  ).POST(
    new Request(`http://jellylens.test/api/downloads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    params(id),
  );
  return { status: res.status, body: await res.json() };
};
const remove = async (id: number | string, query = "") =>
  (await pkgRoute()).DELETE(
    new Request(`http://jellylens.test/api/downloads/${id}${query}`, { method: "DELETE" }),
    params(id),
  );

// A package with a file on disk.
function onDisk(dir: string) {
  const id = addPackage({ name: dir, dir, files: [{ url: DD1, name: "a.rar", size: 1 }] });
  fs.mkdirSync(path.join(DOWNLOAD_DIR, dir));
  fs.writeFileSync(path.join(DOWNLOAD_DIR, dir, "a.rar"), "x");
  return id;
}
const exists = (dir: string) => fs.existsSync(path.join(DOWNLOAD_DIR, dir));

describe("DELETE /api/downloads/[id]", () => {
  it("takes an unfinished package off the list with its partial downloads", async () => {
    const id = onDisk("Partial");
    setPackageStatus(id, "failed", "boom");
    expect((await remove(id)).status).toBe(200);
    expect(getPackage(id)).toBeNull();
    expect(listFiles(id)).toEqual([]);
    expect(exists("Partial")).toBe(false);
  });

  it("keeps a finished package's files, unless asked to delete them", async () => {
    const kept = onDisk("Kept");
    setPackageStatus(kept, "done");
    await remove(kept);
    expect(getPackage(kept)).toBeNull();
    expect(exists("Kept")).toBe(true);
    // Any other value of files keeps them too.
    const other = onDisk("Other");
    setPackageStatus(other, "done");
    await remove(other, "?files=keep");
    expect(exists("Other")).toBe(true);

    const gone = onDisk("Gone");
    setPackageStatus(gone, "done");
    await remove(gone, "?files=delete");
    expect(exists("Gone")).toBe(false);
  });

  it("answers 404 for a package that isn't there", async () => {
    expect((await remove(999)).status).toBe(404);
    expect((await remove("x")).status).toBe(404);
  });
});

describe("POST /api/downloads/[id]", () => {
  it("starts a new package, every file or only the episodes the library lacks", async () => {
    library();
    const all = episodesPackage("All");
    expect(await act(all, { action: "start" })).toEqual({ status: 200, body: { ok: true } });
    expect(getPackage(all)?.status).toBe("queued");
    expect(listFiles(all).map((f) => f.status)).toEqual(["queued", "queued"]);
    expect(queue.kickDownloads).toHaveBeenCalled();

    const missing = episodesPackage("Missing");
    await act(missing, { action: "start", only: "missing" });
    expect(listFiles(missing).map((f) => [f.name, f.status])).toEqual([
      ["Show.S01E01.mkv", "skipped"],
      ["Show.S01E02.mkv", "queued"],
    ]);
  });

  it("pauses a waiting or downloading package and resumes a paused one", async () => {
    const id = onDisk("Running");
    await act(id, { action: "start" });
    expect((await act(id, { action: "pause" })).status).toBe(200);
    expect(getPackage(id)?.status).toBe("paused");
    expect((await act(id, { action: "resume" })).status).toBe(200);
    expect(getPackage(id)?.status).toBe("queued");
    setPackageStatus(id, "downloading");
    await act(id, { action: "pause" });
    expect(getPackage(id)?.status).toBe("paused");
    // Pausing keeps what's on disk.
    expect(exists("Running")).toBe(true);
  });

  it("retries a failed package's failed files", async () => {
    const id = addPackage({
      name: "Failed",
      dir: "Failed",
      files: [
        { url: DD1, name: "a.rar", size: 10 },
        { url: DD2, name: "b.rar", size: 10 },
      ],
    });
    await act(id, { action: "start" });
    const [a, b] = listFiles(id);
    updateFile(a.id, { status: "done", received: 10 });
    updateFile(b.id, { status: "failed", received: 4, error: "File not found" });
    setPackageStatus(id, "failed", "b.rar: File not found");
    expect((await act(id, { action: "retry" })).status).toBe(200);
    expect(getPackage(id)).toMatchObject({ status: "queued", error: null, finishedAt: null });
    expect(listFiles(id).map((f) => [f.status, f.received, f.error])).toEqual([
      ["done", 10, null],
      ["queued", 4, null],
    ]);
    expect(queue.settlePackage).toHaveBeenCalledWith(id);
  });

  it("refuses an action the package's status doesn't allow", async () => {
    const id = onDisk("Pending");
    expect(await act(id, { action: "pause" })).toEqual({
      status: 409,
      body: { error: "Only a waiting or downloading package can be paused." },
    });
    expect((await act(id, { action: "resume" })).body).toEqual({ error: "Only a paused package can be resumed." });
    expect((await act(id, { action: "retry" })).body).toEqual({ error: "Only a failed package can be retried." });
    await act(id, { action: "start" });
    expect(await act(id, { action: "start" })).toEqual({
      status: 409,
      body: { error: "Only a new package can be started." },
    });
    expect(queue.kickDownloads).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown action, and answers 404 for an unknown package", async () => {
    const id = onDisk("Unknown");
    for (const body of [{ action: "explode" }, { action: "toString" }, {}, "start", null, { action: 1 }]) {
      const res = await act(id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error).toBe('Expected { action: "start" | "pause" | "resume" | "reset" | "retry" }.');
    }
    expect((await act(999, { action: "start" })).status).toBe(404);
  });
});
