import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { DOWNLOAD_DIR } from "@/lib/env";
import { addPackage, setPackageStatus } from "@/lib/store";

// GET /api/downloads/[id]/file?path=…: one of a finished package's files,
// with DOWNLOAD_DIR a throwaway folder (the container's env names a real one).
vi.mock("@/lib/env", async (original) => {
  const fsp = await import("node:fs");
  const os = await import("node:os");
  const p = await import("node:path");
  return {
    ...(await original<typeof import("@/lib/env")>()),
    DOWNLOAD_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-downloads-")),
  };
});
afterAll(() => fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true }));
const get = async (id: number | string, rel: string | null, headers: Record<string, string> = {}) =>
  (await import("./downloads/[id]/file/route")).GET(
    new Request(
      `http://jellylens.test/api/downloads/${id}/file` + (rel === null ? "" : "?path=" + encodeURIComponent(rel)),
      { headers },
    ),
    { params: Promise.resolve({ id: String(id) }) },
  );

const made: string[] = [];
afterEach(() => {
  for (const p of made.splice(0)) fs.rmSync(p, { recursive: true, force: true });
});

// A package whose folder holds the given files (relative path: content).
function pkg(dir: string, files: Record<string, string | Buffer>, status: "done" | "failed" = "done") {
  const root = path.join(DOWNLOAD_DIR, dir);
  made.push(root);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content);
  }
  const id = addPackage({ name: dir, dir, files: [{ url: "https://example.com/a.rar", name: "a.rar", size: 1 }] });
  setPackageStatus(id, status);
  return id;
}

const DIGITS = "0123456789";

describe("GET /api/downloads/[id]/file", () => {
  it("sends the whole file as an attachment", async () => {
    const id = pkg("Whole", { "Sub/movie.mkv": DIGITS });
    const res = await get(id, "Sub/movie.mkv");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
    expect(res.headers.get("Content-Length")).toBe("10");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("Content-Range")).toBeNull();
    expect(res.headers.get("Content-Disposition")).toBe(`attachment; filename="movie.mkv"; filename*=UTF-8''movie.mkv`);
    expect(await res.text()).toBe(DIGITS);
  });

  it("answers a Range with just those bytes", async () => {
    const id = pkg("Ranges", { "a.bin": DIGITS });
    const part = async (range: string) => {
      const res = await get(id, "a.bin", { range });
      return [res.status, res.headers.get("Content-Range"), res.headers.get("Content-Length"), await res.text()];
    };
    expect(await part("bytes=2-5")).toEqual([206, "bytes 2-5/10", "4", "2345"]);
    // Open-ended, and an end past the file's: up to its last byte.
    expect(await part("bytes=7-")).toEqual([206, "bytes 7-9/10", "3", "789"]);
    expect(await part("bytes=8-99")).toEqual([206, "bytes 8-9/10", "2", "89"]);
    // A suffix: the last n bytes.
    expect(await part("bytes=-3")).toEqual([206, "bytes 7-9/10", "3", "789"]);
    expect(await part("bytes=0-0")).toEqual([206, "bytes 0-0/10", "1", "0"]);
  });

  it("refuses a Range it can't satisfy", async () => {
    const id = pkg("Unsatisfiable", { "a.bin": DIGITS });
    for (const range of ["bytes=10-", "bytes=5-2", "bytes=-0"]) {
      const res = await get(id, "a.bin", { range });
      expect(res.status, range).toBe(416);
      expect(res.headers.get("Content-Range"), range).toBe("bytes */10");
    }
  });

  // RFC 9110 14.1.3: a suffix longer than the file means the whole file.
  it("sends all of it for a suffix longer than the file", async () => {
    const id = pkg("LongSuffix", { "a.bin": DIGITS });
    const res = await get(id, "a.bin", { range: "bytes=-20" });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-9/10");
    expect(await res.text()).toBe(DIGITS);
  });

  it("ignores a Range it doesn't parse, sending the whole file", async () => {
    const id = pkg("Ignored", { "a.bin": DIGITS });
    for (const range of ["bytes=0-1,4-5", "items=0-1", "bytes=-", "bytes=a-b"]) {
      const res = await get(id, "a.bin", { range });
      expect(res.status, range).toBe(200);
      expect(res.headers.get("Content-Range"), range).toBeNull();
      expect(await res.text(), range).toBe(DIGITS);
    }
  });

  it("keeps quotes and non-ASCII out of the plain filename, UTF-8 in filename*", async () => {
    const name = 'Ünïcode "q".mkv';
    const id = pkg("Names", { [name]: "x" });
    const res = await get(id, name);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="_n_code _q_.mkv"; filename*=UTF-8''%C3%9Cn%C3%AFcode%20%22q%22.mkv`,
    );
  });

  it("serves nothing of an unfinished package", async () => {
    const id = pkg("Unfinished", { "a.bin": DIGITS }, "failed");
    const res = await get(id, "a.bin");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No such file." });
  });

  it("serves nothing outside the package's folder", async () => {
    pkg("Neighbor", { "secret.txt": "secret" });
    fs.writeFileSync(path.join(DOWNLOAD_DIR, "top.txt"), "top");
    made.push(path.join(DOWNLOAD_DIR, "top.txt"));
    const id = pkg("Inside", { "a.bin": DIGITS, "Sub/b.bin": "b" });
    for (const rel of [
      "../Neighbor/secret.txt",
      "../top.txt",
      "Sub/../../top.txt",
      path.join(DOWNLOAD_DIR, "top.txt"),
      "/etc/passwd",
      "",
      ".",
      "Sub",
      "missing.bin",
    ]) {
      expect((await get(id, rel)).status, rel).toBe(404);
    }
    expect((await get(id, null)).status).toBe(404);
    // A path that only passes through a parent and back in is fine.
    expect(await (await get(id, "Sub/../a.bin")).text()).toBe(DIGITS);
  });

  it("sends an empty file, with or without a Range", async () => {
    const id = pkg("Empty", { "empty.bin": "" });
    for (const range of [undefined, "bytes=0-"]) {
      const res = await get(id, "empty.bin", range ? { range } : undefined);
      expect(res.status, range).toBe(200);
      expect(res.headers.get("Content-Length"), range).toBe("0");
      expect(await res.text(), range).toBe("");
    }
  });

  it("percent-encodes what RFC 5987 doesn't allow in filename*, and a backslash in filename", async () => {
    const name = "It's (a) b\\c*.mkv";
    const id = pkg("Escapes", { [name]: "x" });
    const res = await get(id, name);
    expect(res.headers.get("Content-Disposition")).toBe(
      `attachment; filename="It's (a) b_c*.mkv"; filename*=UTF-8''It%27s%20%28a%29%20b%5Cc%2A.mkv`,
    );
  });

  it("answers 404 for an unknown or malformed package id", async () => {
    expect((await get(999, "a.bin")).status).toBe(404);
    expect((await get("abc", "a.bin")).status).toBe(404);
    expect((await get("1.5", "a.bin")).status).toBe(404);
  });
});
