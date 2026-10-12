import type { OrganizeItem, OrganizeResponse } from "@/lib/api-types";
import type { LibraryTarget } from "@/lib/library-move";

// The disk an item goes to unless another is picked: the one that has the
// title already, else the first (in disk order) it fits on; null if none
// does. Not the one with the most room: that may be one left out of the
// backup.
export function defaultTarget(item: OrganizeItem): LibraryTarget | null {
  return item.targets.find((t) => t.existing) ?? item.targets.find((t) => fits(item, t)) ?? null;
}

// The disk an item goes to: the one it's being moved to, else the one
// picked (its path), else the default.
export function targetOf(item: OrganizeItem, picked?: string): LibraryTarget | null {
  const chosen = item.move?.target ?? picked;
  return (chosen && item.targets.find((t) => t.path === chosen)) || defaultTarget(item);
}

export const fits = (item: OrganizeItem, target: LibraryTarget) =>
  target.freeBytes === null || target.freeBytes >= item.bytes;

// Where an item's files go: the folder on target's disk ("nvme03/movies")
// and the title's folder there, the one the disk has if it has one.
export function destination(item: OrganizeItem, target: LibraryTarget | null): { root: string | null; folder: string } {
  return {
    root: target ? `${target.disk}/${target.path.split("/").at(-1)}` : null,
    folder: target?.existing ?? item.folder,
  };
}

// What the library has of an item already, as paths in its title's folder
// (videos and their subtitles), for the title cell's tree.
export const ownedInFolder = (item: OrganizeItem) =>
  item.owned.flatMap((o) => [o.path, ...o.extras]).map((p) => p.split("/").slice(3).join("/"));

// Fast polling while a move (or an Undo) waits or runs.
export const isMoving = (data: OrganizeResponse) => [...data.items, ...data.moved].some((i) => i.move && !i.move.error);
