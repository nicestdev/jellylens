import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import {
  archiveSets,
  kickDownloads,
  NETWORK_RETRY_MS,
  packageDir,
  packageOutputs,
  packagePath,
  safeName,
  settlePackage,
  stopPackage,
} from "./downloader";
import { DOWNLOAD_DIR } from "./env";
import { eventsAfter } from "./events";
import { addPackage, getPackage, listFiles, pausePackage, startPackage, updateFile } from "./store";

// Downloads go to a throwaway folder of this file's own, and links are
// fetched through Real-Debrid (a token is set, its answers are mocked).
vi.mock("./env", async (importOriginal) => {
  const os = await import("node:os");
  const fsp = await import("node:fs");
  const p = await import("node:path");
  return {
    ...(await importOriginal<typeof import("./env")>()),
    DOWNLOAD_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-downloads-")),
    REALDEBRID_TOKEN: "rd-token",
  };
});

afterEach(() => {
  for (const entry of fs.readdirSync(DOWNLOAD_DIR)) fs.rmSync(path.join(DOWNLOAD_DIR, entry), { recursive: true });
});
afterAll(() => fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true }));

// Writes files (relative path -> content) into a package's folder.
function writeFiles(dir: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(DOWNLOAD_DIR, dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

// A started package of plain files (no archives, so nothing to extract).
function started(names: string[]) {
  const id = addPackage({
    name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
    dir: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
    files: names.map((name) => ({ url: `https://ddownload.com/${name}`, name, size: 100 })),
  });
  startPackage(id);
  return { id, files: listFiles(id) };
}

describe("settlePackage", () => {
  it("fails the package as soon as a file fails, naming each failed file with its error", () => {
    const { id, files } = started(["a.mkv", "b.mkv", "c.mkv", "d.mkv"]);
    updateFile(files[0].id, { status: "failed", error: "File not found" });
    updateFile(files[1].id, { status: "downloading" });
    updateFile(files[2].id, { status: "failed", error: null });
    settlePackage(id);
    expect(getPackage(id)).toMatchObject({ status: "failed", error: "a.mkv: File not found\nc.mkv: Failed" });
    expect(getPackage(id)?.finishedAt).not.toBeNull();
    expect(eventsAfter(0).events).toEqual([
      expect.objectContaining({
        title: "Download failed",
        description: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR: a.mkv: File not found",
        tone: "error",
      }),
    ]);
  });

  it("waits while files come in, and is done when they all did, ready to organize", () => {
    const { id, files } = started(["a.mkv", "b.mkv"]);
    updateFile(files[0].id, { status: "done", received: 100 });
    settlePackage(id);
    expect(getPackage(id)?.status).toBe("queued");
    updateFile(files[1].id, { status: "done", received: 100 });
    settlePackage(id);
    expect(getPackage(id)).toMatchObject({ status: "done", error: null });
    expect(eventsAfter(0).events).toEqual([expect.objectContaining({ title: "Ready to organize", tone: "success" })]);
  });

  it("leaves a new package alone, even with a part the hoster has no more", () => {
    const id = addPackage({ name: "X", dir: "X", files: [{ url: "u", name: "a.mkv", size: null }] });
    updateFile(listFiles(id)[0].id, { status: "failed", error: "Offline" });
    settlePackage(id);
    expect(getPackage(id)?.status).toBe("pending");
  });
});

describe("safeName", () => {
  it("keeps a plain name as it is", () => {
    expect(safeName("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR")).toBe(
      "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
    );
  });

  it("turns slashes and NUL into underscores, so a name stays one folder", () => {
    expect(safeName("a/b\\c\0d")).toBe("a_b_c_d");
    expect(safeName("../../etc/passwd")).toBe("_.._etc_passwd");
  });

  it("drops control characters, leading dots and outer spaces", () => {
    expect(safeName("  a\tb\nc  ")).toBe("abc");
    expect(safeName("...hidden")).toBe("hidden");
    expect(safeName("..")).toBe("download");
    // Spaces before the dots don't let them through.
    expect(safeName(" ..")).toBe("download");
    expect(safeName(" .")).toBe("download");
  });

  it("cuts long names to 200 characters, and names an empty one", () => {
    expect(safeName("x".repeat(300))).toHaveLength(200);
    expect(safeName("")).toBe("download");
    expect(safeName("   ")).toBe("download");
  });
});

describe("packageDir", () => {
  it("is the package's name, made safe", () => {
    expect(packageDir("Heat.1995/German")).toBe("Heat.1995_German");
  });

  it("numbers the name when a package or a folder on disk has it", () => {
    addPackage({ name: "Heat", dir: "Heat", files: [] });
    expect(packageDir("Heat")).toBe("Heat (2)");
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "Heat (2)"));
    expect(packageDir("Heat")).toBe("Heat (3)");
  });
});

describe("packageOutputs", () => {
  it("lists the folder's files, nested ones too, with sizes, by path", () => {
    writeFiles("Pkg", { "b.mkv": "12345", "a.nfo": "1", "Subs/de.srt": "123" });
    fs.mkdirSync(path.join(DOWNLOAD_DIR, "Pkg", "Empty"));
    expect(packageOutputs({ dir: "Pkg" })).toEqual([
      { path: "a.nfo", size: 1 },
      { path: "b.mkv", size: 5 },
      { path: "Subs/de.srt", size: 3 },
    ]);
  });

  it("is empty when the folder is gone", () => {
    expect(packageOutputs({ dir: "Gone" })).toEqual([]);
  });
});

describe("archiveSets", () => {
  it("groups a multi-part RAR's parts, the first part to hand to 7-Zip", () => {
    expect(archiveSets(["Heat.part02.rar", "Heat.part01.rar", "Heat.part03.rar"])).toEqual([
      {
        key: "Heat.part*.rar",
        first: "Heat.part01.rar",
        members: ["Heat.part02.rar", "Heat.part01.rar", "Heat.part03.rar"],
      },
    ]);
  });

  it("groups an old-style .rar with its .r00, .r01…", () => {
    expect(archiveSets(["Heat.r00", "Heat.rar", "Heat.r01"])).toEqual([
      { key: "Heat.rar", first: "Heat.rar", members: ["Heat.r00", "Heat.rar", "Heat.r01"] },
    ]);
  });

  it("groups a split 7z and a split ZIP, and takes a lone archive as a set of one", () => {
    expect(archiveSets(["a.7z.002", "a.7z.001", "b.7z", "c.z01", "c.zip", "d.zip"])).toEqual([
      { key: "a.7z", first: "a.7z.001", members: ["a.7z.002", "a.7z.001"] },
      { key: "b.7z", first: "b.7z", members: ["b.7z"] },
      { key: "c.zip", first: "c.zip", members: ["c.z01", "c.zip"] },
      { key: "d.zip", first: "d.zip", members: ["d.zip"] },
    ]);
  });

  it("has no first when the first part is missing", () => {
    expect(archiveSets(["Heat.part2.rar", "Heat.part3.rar"])).toEqual([
      { key: "Heat.part*.rar", first: null, members: ["Heat.part2.rar", "Heat.part3.rar"] },
    ]);
    expect(archiveSets(["Heat.r00"])[0].first).toBeNull();
    expect(archiveSets(["a.7z.002"])[0].first).toBeNull();
  });

  it("keeps each season episode's parts apart, and leaves other files out", () => {
    const sets = archiveSets([
      "Show.S01E01.part1.rar",
      "Show.S01E01.part2.rar",
      "Show.S01E02.part1.rar",
      "Show.S01E02.nfo",
      "Show.S01E03.mkv",
    ]);
    expect(sets.map((s) => [s.key, s.first, s.members.length])).toEqual([
      ["Show.S01E01.part*.rar", "Show.S01E01.part1.rar", 2],
      ["Show.S01E02.part*.rar", "Show.S01E02.part1.rar", 1],
    ]);
    expect(archiveSets(["a.mkv", "b.nfo", "c.srt"])).toEqual([]);
  });

  it("reads the extensions whatever their case", () => {
    expect(archiveSets(["HEAT.PART1.RAR", "HEAT.PART2.RAR"])).toEqual([
      { key: "HEAT.part*.rar", first: "HEAT.PART1.RAR", members: ["HEAT.PART1.RAR", "HEAT.PART2.RAR"] },
    ]);
  });
});

// The download queue end to end: Real-Debrid hands out the link, the
// "hoster" answers with the file.
describe("kickDownloads", () => {
  const RD = "https://api.real-debrid.com/rest/1.0";

  function serve(file: (init?: RequestInit) => Response) {
    return mockFetch((url, init) => {
      if (url.href === `${RD}/hosts/domains`) return json(["example.com"]);
      if (url.href === `${RD}/unrestrict/link`) return json({ download: "https://cdn.example.net/file" });
      if (url.hostname === "cdn.example.net") return file(init);
    });
  }

  function queued(name: string, received = 0) {
    const id = addPackage({
      name: "Pkg",
      dir: "Pkg",
      files: [{ url: `https://example.com/files/${name}`, name, size: null }],
    });
    startPackage(id);
    if (received) updateFile(listFiles(id)[0].id, { received });
    return id;
  }

  const settled = (id: number) =>
    vi.waitFor(() => expect(["done", "failed"]).toContain(getPackage(id)?.status), { timeout: 2000 });

  it("downloads a file under the server's name, and finishes the package", async () => {
    serve(
      () =>
        new Response("hello", {
          headers: { "content-disposition": 'attachment; filename="Heat 1995.mkv"', "content-length": "5" },
        }),
    );
    const id = queued("abc123");
    kickDownloads();
    await settled(id);
    expect(getPackage(id)?.status).toBe("done");
    expect(listFiles(id)).toMatchObject([{ name: "Heat 1995.mkv", size: 5, received: 5, status: "done" }]);
    expect(packageOutputs(getPackage(id)!)).toEqual([{ path: "Heat 1995.mkv", size: 5 }]);
  });

  it.each([
    ["filename*=UTF-8''M%C3%BCnchner.mkv", "Münchner.mkv"],
    ["attachment; filename=\"plain.mkv\"; filename*=UTF-8''st%C3%A4r.mkv", "stär.mkv"],
    ["attachment; filename=plain.mkv", "plain.mkv"],
    // A language tag, or a charset other than UTF-8, isn't part of the name.
    ["attachment; filename*=UTF-8'en'Heat.mkv", "Heat.mkv"],
    ["attachment; filename*=iso-8859-1''Heat.mkv", "Heat.mkv"],
    // A broken percent-encoding falls back to the plain name.
    ["attachment; filename=\"plain.mkv\"; filename*=UTF-8''bad%E0%A4.mkv", "plain.mkv"],
    // A name that tries to leave the package's folder stays in it.
    ['attachment; filename="../../escape.mkv"', "_.._escape.mkv"],
  ])("takes the name from Content-Disposition %s", async (header, name) => {
    serve(() => new Response("hi", { headers: { "content-disposition": header } }));
    const id = queued("abc123");
    kickDownloads();
    await settled(id);
    expect(listFiles(id)[0]).toMatchObject({ name, status: "done" });
    expect(fs.existsSync(path.join(packagePath(getPackage(id)!), name))).toBe(true);
  });

  it("keeps the name it came with when the server names none", async () => {
    serve(() => new Response("hi"));
    const id = queued("Heat.1995.mkv");
    kickDownloads();
    await settled(id);
    expect(listFiles(id)[0]).toMatchObject({ name: "Heat.1995.mkv", status: "done", received: 2 });
  });

  it("resumes a partial file from where it stopped, keeping its name", async () => {
    writeFiles("Pkg", { "Heat.1995.mkv.part": "hel" });
    const fetch = serve(
      () =>
        new Response("lo", {
          status: 206,
          headers: { "content-disposition": 'filename="other.mkv"', "content-length": "2" },
        }),
    );
    const id = queued("Heat.1995.mkv", 3);
    kickDownloads();
    await settled(id);
    const download = fetch.mock.calls.find(([u]) => String(u).startsWith("https://cdn.example.net"));
    expect(download?.[1]?.headers).toEqual({ Range: "bytes=3-" });
    expect(listFiles(id)[0]).toMatchObject({ name: "Heat.1995.mkv", size: 5, received: 5, status: "done" });
    expect(fs.readFileSync(path.join(DOWNLOAD_DIR, "Pkg", "Heat.1995.mkv"), "utf8")).toBe("hello");
  });

  it("resumes a file whose connection dropped, from the bytes it got", async () => {
    let tries = 0;
    let sent = 0;
    const fetch = serve(() =>
      ++tries === 1
        ? new Response(
            new ReadableStream({
              // The bytes, then a moment later the drop (right away, it would discard them).
              async pull(c) {
                if (!sent++) return c.enqueue(new TextEncoder().encode("hel"));
                await new Promise((r) => setTimeout(r, 20));
                c.error(new TypeError("terminated"));
              },
            }),
            { headers: { "content-length": "5" } },
          )
        : new Response("lo", { status: 206, headers: { "content-length": "2" } }),
    );
    const id = queued("Heat.1995.mkv");
    kickDownloads();
    await settled(id);
    const downloads = fetch.mock.calls.filter(([u]) => String(u).startsWith("https://cdn.example.net"));
    expect(downloads[1]?.[1]?.headers).toEqual({ Range: "bytes=3-" });
    expect(listFiles(id)[0]).toMatchObject({ status: "done", received: 5 });
    expect(fs.readFileSync(path.join(DOWNLOAD_DIR, "Pkg", "Heat.1995.mkv"), "utf8")).toBe("hello");
  });

  it("keeps a partial file's progress when paused while the link is still being asked for", async () => {
    writeFiles("Pkg", { "Heat.1995.mkv.part": "hel" });
    let link!: () => void;
    mockFetch((url, init) => {
      if (url.href === `${RD}/hosts/domains`) return json(["example.com"]);
      if (url.href === `${RD}/unrestrict/link`)
        return new Promise((resolve) => (link = () => resolve(json({ download: "https://cdn.example.net/file" }))));
      if (url.hostname === "cdn.example.net") {
        if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return new Response("lo", { status: 206 });
      }
    });
    const id = queued("Heat.1995.mkv", 3);
    kickDownloads();
    await vi.waitFor(() => expect(link).toBeTypeOf("function"));
    pausePackage(id);
    stopPackage(id, "pause");
    link();
    await vi.waitFor(() => expect(listFiles(id)[0].status).toBe("queued"));
    expect(listFiles(id)[0].received).toBe(3);
  });

  describe("out of reach before the hoster answers", () => {
    const pauses = [...NETWORK_RETRY_MS];
    const unreachable = () => {
      throw new TypeError("fetch failed", {
        cause: Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      });
    };
    afterEach(() => NETWORK_RETRY_MS.splice(0, NETWORK_RETRY_MS.length, ...pauses));

    it("tries again after a pause", async () => {
      NETWORK_RETRY_MS.splice(0, NETWORK_RETRY_MS.length, 0, 0);
      let tries = 0;
      serve(() => (++tries === 1 ? unreachable() : new Response("hi")));
      const id = queued("Heat.1995.mkv");
      kickDownloads();
      await settled(id);
      expect(tries).toBe(2);
      expect(listFiles(id)[0]).toMatchObject({ status: "done", received: 2 });
    });

    it("fails the file once every try did, saying why", async () => {
      NETWORK_RETRY_MS.splice(0, NETWORK_RETRY_MS.length, 0, 0);
      let tries = 0;
      serve(() => (tries++, unreachable()));
      const id = queued("Heat.1995.mkv");
      kickDownloads();
      await settled(id);
      expect(tries).toBe(3);
      expect(listFiles(id)[0]).toMatchObject({ status: "failed", error: "fetch failed (ECONNRESET)" });
    });
  });

  it("fails the file, and so the package, when the hoster answers with an error", async () => {
    serve(() => new Response("gone", { status: 404 }));
    const id = queued("Heat.1995.mkv");
    kickDownloads();
    await settled(id);
    expect(listFiles(id)[0]).toMatchObject({ status: "failed", error: "The hoster answered HTTP 404" });
    expect(getPackage(id)).toMatchObject({ status: "failed", error: "Heat.1995.mkv: The hoster answered HTTP 404" });
  });

  it("fails a link no account or Real-Debrid covers", async () => {
    mockFetch((url) => (url.href === `${RD}/hosts/domains` ? json(["example.com"]) : undefined));
    const id = addPackage({
      name: "Pkg",
      dir: "Pkg",
      files: [{ url: "https://example.org/a.mkv", name: "a.mkv", size: null }],
    });
    startPackage(id);
    kickDownloads();
    await settled(id);
    expect(listFiles(id)[0].error).toBe(
      "No account for example.org, and Real-Debrid doesn't cover it (or isn't set up)",
    );
  });

  // A ZIP stands in for FuN's RAR in a RAR (7-Zip writes no RAR).
  it.skipIf(spawnSync("7zz").error)("extracts an archive that came out of the archive, too", async () => {
    const tmp = fs.mkdtempSync(path.join(DOWNLOAD_DIR, "src-"));
    fs.mkdirSync(path.join(tmp, "Heat"));
    fs.writeFileSync(path.join(tmp, "Heat", "Heat.1995.mkv"), "video");
    spawnSync("7zz", ["a", "inner.zip", "Heat"], { cwd: tmp });
    fs.writeFileSync(path.join(tmp, ".md5-change-1"), "");
    spawnSync("7zz", ["a", "outer.zip", "inner.zip", ".md5-change-1"], { cwd: tmp });
    const zip = fs.readFileSync(path.join(tmp, "outer.zip"));
    fs.rmSync(tmp, { recursive: true });
    serve(() => new Response(zip));
    const id = queued("outer.zip");
    kickDownloads();
    await settled(id);
    expect(getPackage(id)?.status).toBe("done");
    expect(
      packageOutputs(getPackage(id)!)
        .map((o) => o.path)
        .sort(),
    ).toEqual([".md5-change-1", "Heat/Heat.1995.mkv"]);
  });

  it.skipIf(spawnSync("7zz").error)("fails, keeping the archive, when nothing came out of it", async () => {
    const tmp = fs.mkdtempSync(path.join(DOWNLOAD_DIR, "src-"));
    fs.mkdirSync(path.join(tmp, "Empty"));
    spawnSync("7zz", ["a", "empty.zip", "Empty"], { cwd: tmp });
    const zip = fs.readFileSync(path.join(tmp, "empty.zip"));
    fs.rmSync(tmp, { recursive: true });
    serve(() => new Response(zip));
    const id = queued("empty.zip");
    kickDownloads();
    await settled(id);
    expect(getPackage(id)).toMatchObject({ status: "failed", error: "empty.zip: Nothing came out of the archive" });
    expect(packageOutputs(getPackage(id)!).map((o) => o.path)).toContain("empty.zip");
  });

  it("leaves a new package alone", async () => {
    const fetch = serve(() => new Response("hi"));
    addPackage({ name: "New", dir: "New", files: [{ url: "https://example.com/a", name: "a", size: null }] });
    kickDownloads();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });
});
