import { P2P_GROUPS, SCENE_GROUPS } from "./env";
import { addGroup, hasGroupNamed, sceneGroupId, type GroupKind } from "./store";
import { findGroup, findSceneGroup } from "./xrel";

// A favorite group as xREL has it, by name (a P2P group's API id; a scene
// group has none, so its id is made from the name).
export async function findGroupOf(kind: GroupKind, name: string): Promise<{ id: string; name: string } | null> {
  if (kind === "p2p") return findGroup(name);
  const found = await findSceneGroup(name);
  return found ? { id: sceneGroupId(found), name: found } : null;
}

// P2P_GROUPS and SCENE_GROUPS: each one the database doesn't have yet,
// looked up on xREL and added, at the start, before the releases sync. One
// xREL doesn't list, or that fails, is logged and left out. How many were
// added.
export async function addEnvGroups(): Promise<number> {
  let added = 0;
  for (const [kind, names] of [
    ["p2p", P2P_GROUPS],
    ["scene", SCENE_GROUPS],
  ] as const) {
    for (const name of names) {
      if (hasGroupNamed(name, kind)) continue;
      try {
        const group = await findGroupOf(kind, name);
        if (!group) {
          console.warn(`[release-groups] xREL doesn't list a ${kind} group called ${name}`);
          continue;
        }
        addGroup(group.id, group.name, kind);
        added++;
      } catch (e) {
        console.warn(`[release-groups] couldn't add ${name}: ${(e as Error).message}`);
      }
    }
  }
  return added;
}
