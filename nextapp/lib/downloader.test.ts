import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { json, mockFetch } from "@/test/http";
import {
  archiveSets,
  kickDownloads,
  packageDir,
  packageFile,
  packageOutputs,
  packagePath,
  safeName,
  settlePackage,
} from "./downloader";
import { DOWNLOAD_DIR } from "./env";
import { addPackage, getPackage, listFiles, startPackage, updateFile } from "./store";

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
  });

  it("waits while files come in, and is done when they all did", () => {
    const { id, files } = started(["a.mkv", "b.mkv"]);
    updateFile(files[0].id, { status: "done", received: 100 });
    settlePackage(id);
    expect(getPackage(id)?.status).toBe("queued");
    updateFile(files[1].id, { status: "done", received: 100 });
    settlePackage(id);
    expect(getPackage(id)).toMatchObject({ status: "done", error: null });
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

describe("packageFile", () => {
  it("finds a file in the package's folder, nested ones too", () => {
    writeFiles("Pkg", { "a.mkv": "1", "Subs/de.srt": "2" });
    expect(packageFile({ dir: "Pkg" }, "a.mkv")).toBe(path.join(DOWNLOAD_DIR, "Pkg", "a.mkv"));
    expect(packageFile({ dir: "Pkg" }, "Subs/de.srt")).toBe(path.join(DOWNLOAD_DIR, "Pkg", "Subs", "de.srt"));
  });

  it("is null for a folder, a missing file or the package's folder itself", () => {
    writeFiles("Pkg", { "Subs/de.srt": "2" });
    expect(packageFile({ dir: "Pkg" }, "Subs")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "missing.mkv")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, ".")).toBeNull();
  });

  it("never leads outside the package's folder", () => {
    writeFiles("Pkg", { "a.mkv": "1" });
    // A sibling whose name starts with the package's.
    writeFiles("Pkg2", { "secret.txt": "x" });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "top.txt"), "x");
    expect(packageFile({ dir: "Pkg" }, "../top.txt")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "../Pkg2/secret.txt")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "Subs/../../top.txt")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, path.join(DOWNLOAD_DIR, "top.txt"))).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "/etc/hostname")).toBeNull();
  });

  it("doesn't follow a symlink out of the folder, only one inside it", () => {
    writeFiles("Pkg", { "a.mkv": "1" });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "top.txt"), "x");
    fs.symlinkSync(path.join(DOWNLOAD_DIR, "top.txt"), path.join(DOWNLOAD_DIR, "Pkg", "out.txt"));
    fs.symlinkSync("a.mkv", path.join(DOWNLOAD_DIR, "Pkg", "in.mkv"));
    expect(packageFile({ dir: "Pkg" }, "out.txt")).toBeNull();
    expect(packageFile({ dir: "Pkg" }, "in.mkv")).toBe(path.join(DOWNLOAD_DIR, "Pkg", "in.mkv"));
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

  it("leaves a new package alone", async () => {
    const fetch = serve(() => new Response("hi"));
    addPackage({ name: "New", dir: "New", files: [{ url: "https://example.com/a", name: "a", size: null }] });
    kickDownloads();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
  });
});
