import type { ReleaseGroupsResponse } from "@/lib/api-types";
import { addGroup, hasGroupNamed, listGroups, removeGroup, sceneGroupId, type GroupKind } from "@/lib/store";
import { findGroup, findSceneGroup, RateLimitError } from "@/lib/xrel";
import { releaseSync } from "@/lib/sync-releases";
import { triggerReleasesSync } from "@/lib/sync-manager";

// The Settings page's favorite groups, P2P and scene; admin only (see
// proxy.ts). syncing: its releases are being fetched right now; matching:
// the sync is checking the titles on TMDB.
function list(): ReleaseGroupsResponse {
  const sync = releaseSync();
  return { Items: listGroups().map((g) => ({ ...g, syncing: sync.groupId === g.id })), matching: sync.matching };
}

const OTHER: Record<GroupKind, GroupKind> = { p2p: "scene", scene: "p2p" };
const LABEL: Record<GroupKind, string> = { p2p: "P2P", scene: "scene" };
const SECTION: Record<GroupKind, string> = { p2p: "P2P groups", scene: "Scene groups" };

// The group as xREL has it, by name.
async function find(kind: GroupKind, name: string): Promise<{ id: string; name: string } | null> {
  if (kind === "p2p") return findGroup(name);
  const found = await findSceneGroup(name);
  return found ? { id: sceneGroupId(found), name: found } : null;
}

export async function GET() {
  return Response.json(list());
}

// Adds a group ({ name, kind }) by name, looked up on xREL, and fetches its
// releases in the background (the list shows the progress).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const kind: GroupKind = body.kind === "scene" ? "scene" : "p2p";
  if (!/^[\w.-]{1,40}$/.test(name)) {
    return Response.json({ error: "Enter a group name as it appears after the dash, e.g. VECTOR." }, { status: 400 });
  }
  if (!hasGroupNamed(name, kind)) {
    let group;
    try {
      group = await find(kind, name);
    } catch (e) {
      const status = e instanceof RateLimitError ? 429 : 502;
      return Response.json({ error: (e as Error).message }, { status });
    }
    if (!group) {
      // Tells the other kind apart from a typo, for the message.
      const other = OTHER[kind];
      const isOther = await find(other, name).then(Boolean, () => false);
      const error = isOther
        ? `${name} is a ${LABEL[other]} group — add it under ${SECTION[other]} instead.`
        : `xREL doesn't list a ${LABEL[kind]} group called ${name}.`;
      return Response.json({ error }, { status: 404 });
    }
    addGroup(group.id, group.name, kind);
    triggerReleasesSync().catch(() => {}); // already logged by makeTrigger
  }
  return Response.json(list());
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => ({}));
  if (typeof body.id !== "string") return Response.json({ error: "Expected { id }." }, { status: 400 });
  removeGroup(body.id);
  return Response.json(list());
}
