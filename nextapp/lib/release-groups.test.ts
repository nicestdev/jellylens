import { describe, expect, it, vi } from "vitest";
import { addGroup, listGroups } from "./store";
import { addEnvGroups } from "./release-groups";

vi.mock("./env", async (original) => ({
  ...(await original<typeof import("./env")>()),
  P2P_GROUPS: ["vector", "NOPE", "FuN"],
  SCENE_GROUPS: ["SAUERKRAUT"],
}));
const xrel = vi.hoisted(() => ({
  findGroup: vi.fn(async (name: string) =>
    name.toLowerCase() === "vector" ? { id: "g1", name: "VECTOR" } : name === "NOPE" ? null : { id: "g2", name },
  ),
  findSceneGroup: vi.fn(async (name: string) => name),
}));
vi.mock("./xrel", async (original) => ({ ...(await original<typeof import("./xrel")>()), ...xrel }));

describe("addEnvGroups", () => {
  it("adds the groups the database doesn't have, as xREL spells them, and leaves out one it doesn't list", async () => {
    addGroup("g2", "FuN", "p2p");
    expect(await addEnvGroups()).toBe(2);
    expect(listGroups().map((g) => [g.kind, g.id, g.name])).toEqual(
      expect.arrayContaining([
        ["p2p", "g1", "VECTOR"],
        ["p2p", "g2", "FuN"],
        ["scene", "scene:SAUERKRAUT", "SAUERKRAUT"],
      ]),
    );
    expect(listGroups()).toHaveLength(3);
    // FuN was there already: not asked about.
    expect(xrel.findGroup).not.toHaveBeenCalledWith("FuN");
    // At the next start there's nothing to add.
    expect(await addEnvGroups()).toBe(0);
  });
});
