import type { NextRequest } from "next/server";
import type { UpgradesResponse } from "@/lib/api-types";
import { movieUnits, seasonUnits } from "@/lib/upgrades";
import { filesByGroup, libraryReleases, upgradeGroups, ownedFiles, syncedAt } from "@/lib/store";

// GET /api/upgrades?library=movies|shows — the library's movies, or its
// shows' seasons, each with the favorite groups' releases of it, for the
// Upgrades page; admin only (see proxy.ts). The page picks a group and a
// quality and adds it up itself, so changing them needs no request.
export async function GET(req: NextRequest) {
  const library = req.nextUrl.searchParams.get("library") === "shows" ? "shows" : "movies";
  const files = ownedFiles(library);
  const releases = libraryReleases(library);
  return Response.json({
    units: library === "movies" ? movieUnits(files, releases) : seasonUnits(files, releases),
    groups: filesByGroup(library),
    ...upgradeGroups(),
    syncedAt: syncedAt("releases"),
  } satisfies UpgradesResponse);
}
