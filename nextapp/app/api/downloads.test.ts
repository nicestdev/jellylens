import { describe, expect, it } from "vitest";
import {
  addPackage,
  getDownloadSettings,
  getPackage,
  listFiles,
  setPackageStatus,
  startPackage,
  updateFile,
} from "@/lib/store";

// POST /api/downloads/[id]: reset.
const post = async (id: number, body: unknown) =>
  (await import("./downloads/[id]/route")).POST(
    new Request(`http://jellylens.test/api/downloads/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: String(id) }) },
  );

function failedPackage() {
  const id = addPackage({
    name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
    dir: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
    files: [
      { url: "https://ddownload.com/1", name: "a.mkv", size: 100 },
      { url: "https://ddownload.com/2", name: "b.mkv", size: 100 },
    ],
  });
  const [a, b] = listFiles(id);
  startPackage(id, [b.id]);
  updateFile(a.id, { status: "failed", received: 50, error: "File not found" });
  setPackageStatus(id, "failed", "a.mkv: File not found");
  return id;
}

describe("POST /api/downloads/[id]", () => {
  it("resets an unfinished package back to New, every file from scratch", async () => {
    const id = failedPackage();
    const res = await post(id, { action: "reset" });
    expect(res.status).toBe(200);
    expect(getPackage(id)).toMatchObject({ status: "pending", error: null, startedAt: null, finishedAt: null });
    expect(listFiles(id).map((f) => [f.status, f.received])).toEqual([
      ["queued", 0],
      ["queued", 0],
    ]);
  });

  it("doesn't reset a new or a finished package", async () => {
    const id = failedPackage();
    await post(id, { action: "reset" });
    expect((await post(id, { action: "reset" })).status).toBe(409);
    setPackageStatus(id, "done");
    const res = await post(id, { action: "reset" });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Only an unfinished package can be reset." });
  });
});

// PATCH /api/downloads: the archive passwords.
const patch = async (body: unknown) =>
  (await import("./downloads/route")).PATCH(
    new Request("http://jellylens.test/api/downloads", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("PATCH /api/downloads", () => {
  it("keeps the archive passwords in order, blank and repeated ones dropped, out of its answer", async () => {
    const res = await patch({ passwords: [" serienfans.org ", "", "hd-source.to", "serienfans.org"] });
    expect(res.status).toBe(200);
    expect(getDownloadSettings()).toEqual({ slots: 2, passwords: ["serienfans.org", "hd-source.to"] });
    expect(await res.json()).not.toHaveProperty("passwords");
    await patch({ passwords: [] });
    expect(getDownloadSettings().passwords).toEqual([]);
  });

  it("refuses passwords that aren't a list of strings", async () => {
    expect((await patch({ passwords: "serienfans.org" })).status).toBe(400);
    expect((await patch({ passwords: [1] })).status).toBe(400);
    expect(getDownloadSettings().passwords).toEqual([]);
  });
});
