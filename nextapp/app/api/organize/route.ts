import fs from "fs";
import path from "path";
import type { OrganizeDisk, OrganizeResponse } from "@/lib/api-types";
import { LIBRARY_DIR } from "@/lib/env";
import { libraryTargets, moveOf, movePlan, ownedFiles, startMove, startUndo } from "@/lib/library-move";
import { deletePackage, getPackage, listPackages } from "@/lib/store";

// The library's disks (LIBRARY_DIR's folders) with their free and total
// bytes; [] if it's unset or unreadable.
function disks(): OrganizeDisk[] {
  if (!LIBRARY_DIR) return [];
  try {
    return fs
      .readdirSync(LIBRARY_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
      .map((disk) => {
        try {
          const s = fs.statfsSync(path.join(LIBRARY_DIR, disk));
          return { disk, freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
        } catch {
          return { disk, freeBytes: null, totalBytes: null };
        }
      });
  } catch {
    return [];
  }
}

// What a moved package's files take in the library now (0 for any gone).
function movedBytes(folder: string, files: { to: string }[]): number {
  let bytes = 0;
  for (const f of files)
    try {
      bytes += fs.statSync(path.join(LIBRARY_DIR, folder, f.to)).size;
    } catch {
      // moved or deleted since
    }
  return bytes;
}

async function organizePage(): Promise<OrganizeResponse> {
  const packages = listPackages().filter((p) => p.status === "done");
  const found = disks();
  return {
    ready: found.length > 0,
    libraryDir: LIBRARY_DIR,
    disks: found,
    items: await Promise.all(
      packages
        .filter((p) => !p.movedTo)
        .map(async (pkg) => {
          const plan = movePlan(pkg);
          return {
            id: pkg.id,
            name: pkg.name,
            media: pkg.media,
            folder: plan.folder,
            files: plan.files.map((f) => f.to),
            bytes: plan.bytes,
            error: plan.error,
            targets: plan.error ? [] : libraryTargets(pkg),
            owned: await ownedFiles(pkg, plan),
            move: moveOf(pkg.id),
          };
        }),
    ),
    moved: packages
      .filter((p) => p.movedTo)
      .map((p) => ({
        id: p.id,
        name: p.name,
        media: p.media,
        movedTo: p.movedTo!,
        movedAt: p.movedAt!,
        files: (p.movedFiles ?? []).map((f) => f.to),
        bytes: movedBytes(p.movedTo!, p.movedFiles ?? []),
        replaced: p.replaced,
        move: moveOf(p.id),
      }))
      .sort((a, b) => b.movedAt.localeCompare(a.movedAt)),
  };
}

// GET /api/organize — the Organize page; admin only (proxy.ts).
export async function GET() {
  return Response.json((await organizePage()) satisfies OrganizeResponse);
}

// POST { id, target } — moves a finished package into the library folder
// target (one of its targets' paths), in the background; one the library
// has already needs replace (true: Replace, false: Add as version);
// { id, undo: true } moves a moved one back. Answers with the page.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const pkg = Number.isInteger(body?.id) ? getPackage(body.id) : null;
  if (!pkg) return Response.json({ error: "No such package." }, { status: 404 });
  if (body.undo !== true && typeof body.target !== "string")
    return Response.json({ error: "Expected { id, target } or { id, undo: true }." }, { status: 400 });
  const replace = typeof body.replace === "boolean" ? body.replace : undefined;
  const error = body.undo === true ? startUndo(pkg) : await startMove(pkg, body.target, replace);
  if (error) return Response.json({ error }, { status: 409 });
  return Response.json((await organizePage()) satisfies OrganizeResponse);
}

// DELETE — clears Done: forgets the packages moved into the library (their
// files are there, their download folders gone already), not one being
// moved back; answers with the page.
export async function DELETE() {
  for (const p of listPackages()) if (p.movedTo && !moveOf(p.id)?.running) deletePackage(p.id);
  return Response.json((await organizePage()) satisfies OrganizeResponse);
}
