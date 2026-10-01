import type { ReleaseGroupsResponse } from "@/lib/api-types";
import { addGroup, hasGroupNamed, listGroups, removeGroup } from "@/lib/store";
import { findGroup, isSceneGroup, RateLimitError } from "@/lib/xrel";
import { releaseSync } from "@/lib/sync-releases";
import { triggerReleasesSync } from "@/lib/sync-manager";

// The Settings page's favorite groups; admin only (see proxy.ts).
// syncing: its releases are being fetched right now.
function list(): ReleaseGroupsResponse {
  return { Items: listGroups().map((g) => ({ ...g, syncing: releaseSync.groupId === g.id })) };
}

export async function GET() {
  return Response.json(list());
}

// Adds a group by name, looked up on xREL, and fetches its releases in the
// background (the list shows the progress).
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!/^[\w.-]{1,40}$/.test(name)) {
    return Response.json({ error: "Enter a group name as it appears after the dash, e.g. VECTOR." }, { status: 400 });
  }
  if (!hasGroupNamed(name)) {
    let group;
    try {
      group = await findGroup(name);
    } catch (e) {
      const status = e instanceof RateLimitError ? 429 : 502;
      return Response.json({ error: (e as Error).message }, { status });
    }
    if (!group) {
      const scene = await isSceneGroup(name).catch(() => false);
      const error = scene
        ? `${name} is a scene group. Only P2P groups can be added.`
        : `xREL doesn't list a P2P group called ${name}.`;
      return Response.json({ error }, { status: 404 });
    }
    addGroup(group.id, group.name);
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
