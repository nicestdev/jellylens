import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mockFetch } from "@/test/http";
import type { OrganizeResponse, OrganizeScan } from "@/lib/api-types";
import { DOWNLOAD_DIR, LIBRARY_DIR } from "@/lib/env";
import { addPackage, getPackage, setPackageMedia, setPackageStatus } from "@/lib/store";

// GET, POST and DELETE /api/organize, and /api/organize/scan. Downloads and the
// library (one disk, nvme01, with movies/) are throwaway folders, Jellyfin's
// rescan is mocked, and the library scan is stubbed.
vi.mock("@/lib/env", async (original) => {
  const fsp = await import("node:fs");
  const os = await import("node:os");
  const p = await import("node:path");
  return {
    ...(await original<typeof import("@/lib/env")>()),
    DOWNLOAD_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-downloads-")),
    LIBRARY_DIR: fsp.mkdtempSync(p.join(os.tmpdir(), "jellylens-library-")),
    JELLYFIN_URL: "http://jellyfin.test",
    JELLYFIN_API_KEY: "key",
  };
});
const sync = vi.hoisted(() => ({ startByHand: vi.fn() }));
vi.mock("@/lib/sync-manager", async (original) => ({
  ...(await original<typeof import("@/lib/sync-manager")>()),
  startByHand: sync.startByHand,
}));

const MOVIES = () => path.join(LIBRARY_DIR, "nvme01", "movies");
// Jellyfin answering a rescan with status.
const refresh = (status = 204) =>
  mockFetch((url, init) =>
    url.pathname === "/Library/Refresh" && init?.method === "POST" ? new Response(null, { status }) : undefined,
  );
const FOLDER = "Heat (1995) [tmdbid-949]";

afterEach(() => {
  for (const dir of [DOWNLOAD_DIR, LIBRARY_DIR])
    for (const entry of fs.readdirSync(dir)) fs.rmSync(path.join(dir, entry), { recursive: true });
});
afterAll(() => {
  fs.rmSync(DOWNLOAD_DIR, { recursive: true, force: true });
  fs.rmSync(LIBRARY_DIR, { recursive: true, force: true });
});

// A finished movie package with its video, and the library's disk.
function heat(): number {
  const id = addPackage({ name: "Heat.1995.German.DL.1080p-WAYNE", dir: "Heat", files: [] });
  setPackageMedia(id, { type: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null });
  setPackageStatus(id, "done");
  fs.mkdirSync(path.join(DOWNLOAD_DIR, "Heat"), { recursive: true });
  fs.writeFileSync(path.join(DOWNLOAD_DIR, "Heat", "Heat.1995.mkv"), "video");
  fs.mkdirSync(MOVIES(), { recursive: true });
  return id;
}

const route = () => import("./organize/route");
const scanRoute = () => import("./organize/scan/route");
const send = async (method: string, body?: unknown) => {
  const { POST, DELETE } = await route();
  const req = new Request("http://jellylens.test/api/organize", {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  return method === "DELETE" ? DELETE() : POST(req);
};
const page = async () => (await (await route()).GET()).json() as Promise<OrganizeResponse>;
const settled = () => (globalThis as unknown as { __jellylensMoves: { chain: Promise<void> } }).__jellylensMoves.chain;

describe("/api/organize", () => {
  it("lists a finished package with where it goes, and the disks", async () => {
    const id = heat();
    const data = await page();
    expect(data.ready).toBe(true);
    expect(data.disks.map((d) => d.disk)).toEqual(["nvme01"]);
    expect(data.items).toEqual([
      expect.objectContaining({ id, folder: FOLDER, files: ["Heat.1995.mkv"], bytes: 5, error: null, move: null }),
    ]);
    expect(data.items[0].targets).toEqual([
      expect.objectContaining({ path: MOVIES(), disk: "nvme01", existing: null }),
    ]);
    expect(data.moved).toEqual([]);
  });

  it("moves one in, lists it as moved, moves it back on Undo, and forgets it on Clear", async () => {
    refresh();
    const id = heat();
    expect((await send("POST", { id, target: MOVIES() })).status).toBe(200);
    await settled();
    let data = await page();
    expect(data.items).toEqual([]);
    expect(data.moved).toEqual([
      expect.objectContaining({ id, movedTo: `nvme01/movies/${FOLDER}`, files: ["Heat.1995.mkv"], bytes: 5 }),
    ]);

    expect((await send("POST", { id, undo: true })).status).toBe(200);
    await settled();
    data = await page();
    expect(data.items.map((i) => i.id)).toEqual([id]);
    expect(fs.existsSync(path.join(MOVIES(), FOLDER))).toBe(false);

    await send("POST", { id, target: MOVIES() });
    await settled();
    expect(((await (await send("DELETE")).json()) as OrganizeResponse).moved).toEqual([]);
    expect(getPackage(id)).toBeNull();
    expect(fs.existsSync(path.join(MOVIES(), FOLDER, "Heat.1995.mkv"))).toBe(true);
    // Each time the queue was through, the library was scanned again.
    await vi.waitFor(() => expect(sync.startByHand.mock.calls).toEqual([["library"], ["library"], ["library"]]));
  });

  it("refuses an unknown package, a missing target, or a folder that isn't one of its targets", async () => {
    const id = heat();
    expect((await send("POST", { id: 999, target: MOVIES() })).status).toBe(404);
    expect((await send("POST", { id })).status).toBe(400);
    const res = await send("POST", { id, target: "/etc" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "No such library folder." });
  });

  it("says why a package can't be moved", async () => {
    const id = heat();
    setPackageMedia(id, null);
    expect((await page()).items[0]).toMatchObject({
      error: "It isn't matched to a movie or show on TMDB.",
      targets: [],
    });
  });
});

describe("/api/organize/scan", () => {
  it("says whether the library scan runs", async () => {
    expect(await (await (await scanRoute()).GET()).json()).toEqual({
      running: false,
      percent: null,
    } satisfies OrganizeScan);
  });

  it("starts the library scan and has Jellyfin scan too", async () => {
    const fetch = refresh();
    await (await scanRoute()).POST();
    expect(sync.startByHand).toHaveBeenCalledWith("library");
    expect(fetch).toHaveBeenCalledWith("http://jellyfin.test/Library/Refresh", expect.anything());
  });

  it("scans even when Jellyfin refuses", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    refresh(401);
    expect((await (await scanRoute()).POST()).status).toBe(200);
    expect(sync.startByHand).toHaveBeenCalledWith("library");
  });
});
