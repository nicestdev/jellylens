import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { packageFile } from "@/lib/downloader";
import { getPackage } from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

// A name for filename*: percent-encoded, the few characters
// encodeURIComponent leaves but RFC 5987 doesn't allow too.
const rfc5987 = (name: string) =>
  encodeURIComponent(name).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// GET ?path=<relative path> — one of a finished package's files, as a
// download to the browser (admin only, see proxy.ts). Honors a Range, so a
// browser can resume a big one.
export async function GET(req: Request, { params }: Params) {
  const id = Number((await params).id);
  const pkg = Number.isInteger(id) ? getPackage(id) : null;
  const rel = new URL(req.url).searchParams.get("path") ?? "";
  const file = pkg && pkg.status === "done" ? packageFile(pkg, rel) : null;
  if (!file) return Response.json({ error: "No such file." }, { status: 404 });

  const size = fs.statSync(file).size;
  const name = path.basename(file);
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="${name.replace(/[^\x20-\x7e]|["\\]/g, "_")}"; filename*=UTF-8''${rfc5987(name)}`,
    "Accept-Ranges": "bytes",
  };
  // An empty file has no bytes to range over.
  if (!size) return new Response(null, { status: 200, headers: { ...headers, "Content-Length": "0" } });
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  let start = 0;
  let end = size - 1;
  if (range && (range[1] || range[2])) {
    // A suffix longer than the file is all of it (RFC 9110); "-0" is none.
    start = range[1] ? Number(range[1]) : Number(range[2]) ? Math.max(0, size - Number(range[2])) : size;
    end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start < 0 || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
  }
  headers["Content-Length"] = String(end - start + 1);
  const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as ReadableStream;
  return new Response(body, { status: range && headers["Content-Range"] ? 206 : 200, headers });
}
