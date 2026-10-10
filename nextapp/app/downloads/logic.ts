import type { DownloadPackageItem } from "@/lib/api-types";
import { formatBytes, plural, formatNumber, seasonCode } from "@/lib/format";
import { parseReleaseName } from "@/lib/title-match";

// What a package row shows, worked out from its files.
type PackageSummary = {
  received: number;
  // Known only once every file's size is (the hoster tells as each starts).
  total: number | null;
  // The total with the sizes not known yet taken as the known ones'
  // average (a release's parts are the same size); null if none is known.
  estimate: number | null;
  // 0–1, for the bar: bytes of the estimate, else files done.
  fraction: number;
  speed: number;
};

export function summarize(pkg: DownloadPackageItem): PackageSummary {
  // Skipped parts don't count.
  pkg = { ...pkg, files: pkg.files.filter((f) => f.status !== "skipped") };
  const received = pkg.files.reduce((n, f) => n + f.received, 0);
  const sized = pkg.files.filter((f) => f.size);
  const known = sized.reduce((n, f) => n + (f.size ?? 0), 0);
  const total = sized.length === pkg.files.length ? known : null;
  const estimate = sized.length ? Math.max(received, (known / sized.length) * pkg.files.length) : null;
  const doneFiles = pkg.files.filter((f) => f.status === "done" || f.status === "extracted").length;
  const speed = pkg.files.reduce((n, f) => n + (f.speed ?? 0), 0);
  const fraction =
    pkg.status === "extracting"
      ? (pkg.extractPercent ?? 0) / 100
      : pkg.status === "done"
        ? 1
        : estimate
          ? received / estimate
          : pkg.files.length
            ? doneFiles / pkg.files.length
            : 0;
  return { received, total, estimate, fraction: Math.min(1, fraction), speed };
}

export const formatSpeed = (bytesPerSecond: number) => `${formatBytes(bytesPerSecond)}/s`;

// "3 min", "1 h 12 min" left at the current speed.
export function timeLeft(remaining: number, speed: number): string | null {
  if (speed <= 0 || remaining <= 0) return null;
  const minutes = Math.ceil(remaining / speed / 60);
  if (minutes < 60) return `${minutes}\u202fmin`;
  return `${Math.floor(minutes / 60)}\u202fh ${minutes % 60}\u202fmin`;
}

// A package's Status cell (the share done is in Progress beside it).
export function statusLabel(pkg: DownloadPackageItem): string {
  switch (pkg.status) {
    case "pending":
      return "Ready";
    case "queued":
      return "Waiting";
    case "downloading":
      return "Loading";
    case "paused":
      return "Paused";
    case "extracting":
      return "Extracting";
    case "done":
      return "Done";
    case "failed":
      return "Failed";
  }
}

// "Name - uploader" without the uploader.
export const releaseName = (name: string) => name.replace(/\s+-\s+[^.]+$/, "").trim();

// The title shown: TMDB's, else the one in the release name.
export function displayName(pkg: DownloadPackageItem): { title: string; year: number | null } {
  if (pkg.media) return { title: pkg.media.title, year: pkg.media.year };
  const parsed = parseReleaseName(releaseName(pkg.name).replace(/\.S\d{1,2}(?:[+-]S?\d{1,2})+(?=\.)/i, ".S01"));
  return { title: parsed.title || pkg.name, year: parsed.year };
}

// The tiles above the list, four like Analytics' and Upgrades': the
// packages (how many in each section), speed now, what's left to download
// (and how long at this speed), free space. A zero is muted.
type QueueTile = { label: string; value: string; hint: string; muted?: boolean };
export function queueTiles(data: {
  packages: DownloadPackageItem[];
  freeBytes: number | null;
  downloadDir: string;
}): QueueTile[] {
  const { packages } = data;
  const speed = packages.reduce((n, p) => n + p.files.reduce((m, f) => m + (f.speed ?? 0), 0), 0);
  const coming = packages.reduce((n, p) => n + p.files.filter((f) => f.speed !== null).length, 0);
  let left = 0;
  for (const p of packages) {
    if (p.status !== "downloading" && p.status !== "queued" && p.status !== "paused") continue;
    for (const f of p.files)
      if (f.status === "queued" || f.status === "downloading") left += Math.max(0, (f.size ?? 0) - f.received);
  }
  const eta = timeLeft(left, speed);
  const sections = groups(packages);
  return [
    {
      label: "Packages",
      value: formatNumber(packages.length),
      hint: sections.length
        ? sections.map((g) => `${g.packages.length} ${g.title.toLowerCase()}`).join(" · ")
        : "none yet",
      muted: !packages.length,
    },
    {
      label: "Speed",
      value: formatSpeed(speed),
      hint: coming ? `${plural(coming, "file")} coming in` : "nothing coming in",
      muted: !speed,
    },
    { label: "Left", value: formatBytes(left), hint: eta ? `about ${eta} at this speed` : "to download", muted: !left },
    {
      label: "Free space",
      value: data.freeBytes !== null ? formatBytes(data.freeBytes) : "?",
      hint: `in ${data.downloadDir}`,
    },
  ];
}

// What Pause all and Resume all would act on.
export const canPauseAll = (packages: DownloadPackageItem[]) =>
  packages.some((p) => p.status === "queued" || p.status === "downloading");
export const canResumeAll = (packages: DownloadPackageItem[]) => packages.some((p) => p.status === "paused");

// Fast polling while anything moves.
export const isActive = (packages: DownloadPackageItem[]) =>
  packages.some((p) => p.status === "queued" || p.status === "downloading" || p.status === "extracting");

// The list in parts, empty ones left out: New (waiting for a start, in the
// order they came), Running (failed ones first, they need a hand; then in
// queue order, by when they were started) and Finished (newest first).
export function groups(packages: DownloadPackageItem[]): { title: string; packages: DownloadPackageItem[] }[] {
  const pending = packages.filter((p) => p.status === "pending").sort((a, b) => a.id - b.id);
  const running = packages
    .filter((p) => p.status !== "done" && p.status !== "pending")
    .sort(
      (a, b) =>
        Number(b.status === "failed") - Number(a.status === "failed") ||
        (a.startedAt ?? a.createdAt).localeCompare(b.startedAt ?? b.createdAt) ||
        a.id - b.id,
    );
  // Once moved into the library, it's on Organize's list instead.
  const finished = packages.filter((p) => p.status === "done" && !p.movedTo);
  return [
    { title: "New", packages: pending },
    { title: "Running", packages: running },
    { title: "Finished", packages: finished },
  ].filter((g) => g.packages.length);
}

// The icon for what the library already has of a package, and its
// tooltip; exact: some of it is from this very release. null if nothing.
export function libraryBadge(pkg: DownloadPackageItem): { label: string; hint: string; exact: boolean } | null {
  const lib = pkg.library;
  if (!lib) return null;
  const hint = lib.have.join(", ");
  const exact = lib.exact > 0;
  // ", 3 of this release" after a show's count; all of it: ", all of this release".
  const ofThis = (n: number) =>
    exact ? (lib.exact >= n ? ", all of this release" : `, ${lib.exact} of this release`) : "";
  if (pkg.media?.type === "movie") return { label: exact ? "This release in library" : "In library", hint, exact };
  if (lib.parts) {
    const label = lib.partsOwned === lib.parts ? "All in library" : `${lib.partsOwned} of ${lib.parts} in library`;
    return lib.partsOwned ? { label: label + ofThis(lib.partsOwned), hint, exact } : null;
  }
  if (lib.season?.episodes)
    return {
      label:
        `${seasonCode(lib.season.number)}: ${plural(lib.season.episodes, "episode")} in library` +
        ofThis(lib.season.episodes),
      hint,
      exact,
    };
  return null;
}

// A failure for its row (Downloads, Organize): the first line's reason
// without its file name (a failed file's or the archive's, "name:
// reason"), as a sentence starts and without its closing period, "+N" for
// any more; the whole of it, names and all, goes in the tooltip.
export function errorLine(error: string | null): string {
  const lines = (error ?? "").split("\n").filter(Boolean);
  if (!lines.length) return "Failed";
  const reason = lines[0].replace(/^[^:]*: /, "").replace(/\.$/, "");
  const first = reason.charAt(0).toUpperCase() + reason.slice(1);
  return lines.length > 1 ? `${first} +${lines.length - 1}` : first;
}

// A new package's parts before it's started, for its Status: Checking
// while the hoster is asked about them (lib/download-match.ts); then how
// many are online of how many there should be (gaps in a multi-part RAR's
// numbering count; it can't be extracted then); red when one is missing,
// peach when the hoster didn't answer for one. One that failed (offline, or
// no account for its hoster) says why instead, red, and how many ("No
// account for its hoster · 2 parts"; "+1" for another reason), each one's
// name and reason on hover.
export function partCheck(pkg: DownloadPackageItem): { line: string; hint?: string; tone?: "error" | "warning" } {
  const parts = pkg.files.filter((f) => f.status !== "skipped");
  const open = parts.filter((f) => f.status === "queued");
  const asked = open.filter((f) => f.checked !== null).length;
  if (asked < open.length) return { line: `Checking · ${asked}/${open.length}` };
  const offline = parts.filter((f) => f.status === "failed");
  if (offline.length) {
    const hint = offline.map((f) => `${f.name}: ${f.error ?? "Failed"}`).join("\n");
    const reasons = [...new Set(offline.map((f) => errorLine(f.error)))];
    const more = reasons.length > 1 ? ` +${reasons.length - 1}` : "";
    return { line: `${reasons[0]}${more} · ${plural(offline.length, "part")}`, hint, tone: "error" };
  }
  const unknown = open.filter((f) => f.checked !== "online");
  const sets = new Map<string, Set<number>>();
  for (const f of parts) {
    const m = /^(.*)\.part(\d+)\.rar$/i.exec(f.name);
    if (!m) continue;
    const key = m[1].toLowerCase();
    sets.set(key, (sets.get(key) ?? new Set()).add(Number(m[2])));
  }
  const missing: string[] = [];
  for (const nums of sets.values())
    for (let n = 1; n <= Math.max(...nums); n++) if (!nums.has(n)) missing.push(`part${n}`);
  // Missing parts count as parts too, so a gap shows in the numbers.
  const line = `Online · ${open.length - unknown.length}/${parts.length + missing.length}`;
  const tone = missing.length ? "error" : unknown.length ? "warning" : undefined;
  return { line, tone };
}
