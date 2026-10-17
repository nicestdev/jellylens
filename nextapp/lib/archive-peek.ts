import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import { ARCHIVE_PASSWORDS } from "./env";
import { resolveLink } from "./hosters";
import { getDownloadSettings } from "./store";

const exec = promisify(execFile);
const VIDEO = /\.(mkv|mp4|m4v|avi|ts|m2ts|wmv|mov)$/i;

// A package's archives are named by their uploader ("TeLa1080S04E01.rar"),
// not like the release inside. An archive's first bytes hold its first
// file's header, with the file's name (encrypted ones with the archive
// password too, the same ones extracting tries): a range request for 64 KB
// of the hoster's download, listed with 7-Zip. The name of the first video
// in it (an uploader's ad, "ddownload Premium Account.URL", may come
// before it), null if it can't be had (no range, no matching password, not
// a RAR or 7z with headers up front, no video among the first files).
export async function peekName(url: string): Promise<string | null> {
  const { url: direct } = await resolveLink(url);
  // A hanging hoster would hold up every later peek (one at a time).
  const res = await fetch(direct, { headers: { Range: "bytes=0-65535" }, signal: AbortSignal.timeout(30_000) });
  if (res.status !== 206) {
    await res.body?.cancel();
    return null;
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-"));
  try {
    const file = path.join(dir, "head.rar");
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const known = [...new Set([...getDownloadSettings().passwords, ...ARCHIVE_PASSWORDS])];
    for (const pw of known.length ? known : ["-"]) {
      // A wrong password makes 7-Zip fail without a listing.
      const out = await exec("7zz", ["l", "-slt", `-p${pw}`, file], { timeout: 20_000 }).then(
        (r) => r.stdout,
        (e: { stdout?: string }) => e.stdout ?? "",
      );
      // The first Path is the archive's own.
      const names = [...out.matchAll(/^Path = (.+)$/gm)].slice(1).map((m) => m[1].split(/[\\/]/).pop()!);
      if (names.length) return names.find((n) => VIDEO.test(n)) ?? null;
    }
    return null;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
