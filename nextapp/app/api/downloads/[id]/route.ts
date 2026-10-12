import fs from "fs";
import { kickDownloads, packagePath, settlePackage, stopPackage } from "@/lib/downloader";
import { libraryOf } from "@/lib/download-library";
import { moveOf } from "@/lib/library-move";
import {
  deletePackage,
  getPackage,
  listFiles,
  pausePackage,
  resetPackage,
  resumePackage,
  retryPackage,
  startPackage,
  type DownloadPackage,
  type DownloadStatus,
} from "@/lib/store";

type Params = { params: Promise<{ id: string }> };

async function pkgOf(params: Params["params"]) {
  const id = Number((await params).id);
  return Number.isInteger(id) ? getPackage(id) : null;
}
const notFound = () => Response.json({ error: "No such package." }, { status: 404 });

type Action = "start" | "pause" | "resume" | "reset" | "retry";

// Which statuses each action applies to, and what it does.
const ACTIONS: Record<
  Action,
  {
    from: DownloadStatus[];
    error: string;
    // An error text if it can't (409).
    run: (pkg: DownloadPackage, body: Record<string, unknown>) => string | void;
  }
> = {
  // A new package into the queue. One the library has some of takes
  // choice, one of what libraryOf offers: "replace" (all of it, the old
  // files go once it's moved) or "skip" (without the episodes the
  // library has); remembered for its move.
  start: {
    from: ["pending"],
    error: "Only a new package can be started.",
    run: (pkg, body) => {
      const { library, owned } = libraryOf(pkg, listFiles(pkg.id));
      if (!library) return startPackage(pkg.id);
      const choice = library.choices.find((c) => c === body.choice);
      if (!choice)
        return library.choices.length
          ? `The library has some of it: start it with ${library.choices.map((c) => `choice: "${c}"`).join(" or ")}.`
          : "The library has all of it.";
      startPackage(pkg.id, choice === "skip" ? [...owned] : [], choice);
    },
  },
  // Out of the queue; a part coming in stops, its partial file stays.
  pause: {
    from: ["queued", "downloading"],
    error: "Only a waiting or downloading package can be paused.",
    run: (pkg) => {
      pausePackage(pkg.id);
      stopPackage(pkg.id, "pause");
    },
  },
  // Back in the queue, a part from where it stopped.
  resume: { from: ["paused"], error: "Only a paused package can be resumed.", run: (pkg) => resumePackage(pkg.id) },
  // Everything downloaded goes, and it's back in New. Not for a finished
  // package: its folder holds the extracted files.
  reset: {
    from: ["queued", "downloading", "paused", "extracting", "failed"],
    error: "Only an unfinished package can be reset.",
    run: (pkg) => {
      stopPackage(pkg.id, "reset");
      fs.rmSync(packagePath(pkg), { recursive: true, force: true });
      resetPackage(pkg.id);
    },
  },
  // A failed package's failed files again (from where they stopped), or
  // its extraction.
  retry: {
    from: ["failed"],
    error: "Only a failed package can be retried.",
    run: (pkg) => {
      retryPackage(pkg.id);
      settlePackage(pkg.id);
    },
  },
};

// POST { action: "start" | "pause" | "resume" | "reset" | "retry", choice?: "replace" | "skip" }
export async function POST(req: Request, { params }: Params) {
  const json = await req.json().catch(() => null);
  // Read after the body, right before it's acted on: its status as it is
  // now (a package that just finished must not be Reset as unfinished).
  const pkg = await pkgOf(params);
  if (!pkg) return notFound();
  const body: Record<string, unknown> = json && typeof json === "object" ? json : {};
  const action = ACTIONS[body.action as Action];
  if (typeof body.action !== "string" || !Object.hasOwn(ACTIONS, body.action)) {
    return Response.json(
      {
        error: `Expected { action: ${Object.keys(ACTIONS)
          .map((a) => `"${a}"`)
          .join(" | ")} }.`,
      },
      { status: 400 },
    );
  }
  if (!action.from.includes(pkg.status)) return Response.json({ error: action.error }, { status: 409 });
  const refused = action.run(pkg, body);
  if (refused) return Response.json({ error: refused }, { status: 409 });
  kickDownloads();
  return Response.json({ ok: true });
}

// DELETE — off the list. An unfinished package's folder goes too (its
// partial downloads); a finished one's files stay, unless ?files=delete.
export async function DELETE(req: Request, { params }: Params) {
  const pkg = await pkgOf(params);
  if (!pkg) return notFound();
  // Its files are being copied into the library or back (Organize).
  if (moveOf(pkg.id)?.running) return Response.json({ error: "It's being moved." }, { status: 409 });
  stopPackage(pkg.id, "remove");
  deletePackage(pkg.id);
  const withFiles = new URL(req.url).searchParams.get("files") === "delete";
  if (pkg.status !== "done" || withFiles) fs.rmSync(packagePath(pkg), { recursive: true, force: true });
  return Response.json({ ok: true });
}
