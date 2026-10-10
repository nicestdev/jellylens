"use client";

import { Breakable } from "@/components/breakable";
import { DataTable, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { formatBytes, plural, seasonLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { rankIn } from "@/lib/facets";
import { TIERS } from "@/lib/upgrades";
import { withoutTitle } from "@/lib/release-labels";
import { attributes, formatChange, nameParts, type Attribute, type SwitchRow } from "./logic";

const metaOf = (r: SwitchRow) =>
  r.unit.season !== null ? seasonLabel(r.unit.season) : r.unit.year ? String(r.unit.year) : "";

// Codecs from older to newer (and smaller for the same picture); unknown
// ones aren't ranked.
const CODEC_RANK: Record<string, number> = { x264: 0, h264: 0, avc: 0, x265: 1, h265: 1, hevc: 1, av1: 2 };

// Better or worse after the switch, where that's clear: audio gained
// (DE → DL) or lost, a higher or lower quality, a newer or older codec
// (x264 < x265 < AV1); null for a plain change (another group).
function verdict(a: Attribute): "better" | "worse" | null {
  if (a.same) return null;
  if (a.key === "audio") {
    if (a.after === "DE") return "worse";
    return a.before !== "DL" && a.before !== "ML" ? "better" : null;
  }
  if (a.key === "quality") {
    const rank = rankIn(TIERS);
    return rank(a.after) < rank(a.before) ? "better" : rank(a.after) > rank(a.before) ? "worse" : null;
  }
  if (a.key === "codec") {
    const before = CODEC_RANK[a.before.toLowerCase()];
    const after = CODEC_RANK[a.after.toLowerCase()];
    if (before === undefined || after === undefined || before === after) return null;
    return after > before ? "better" : "worse";
  }
  return null;
}

// An attribute's color: muted where it stays; where it changes green if
// better, red if worse, else plain.
function toneOf(a: Attribute) {
  if (a.same) return "";
  const v = verdict(a);
  return v === "better" ? "text-success" : v === "worse" ? "text-destructive" : "text-foreground";
}

// A line under the title: the file you have (greyed; not on a phone,
// where the release's colors say what changes), then the release.
const NAME_LINE =
  "truncate font-mono text-xs max-sm:line-clamp-2 max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere]";

// The switch list, like Analytics' files: one row per movie or season,
// its title with year or season (and a pack, how many episodes or
// files), under it the file you have, greyed, and the release it'd switch
// to (both without the title, whole on hover), in whose name what
// changes is colored; then the release's group, quality, codec and audio,
// plain, what you have now on hover; then its size and
// the change, green when it frees space, red when it costs some (on a
// phone just that). The title opens its page.
export function SwitchTable({ rows, onOpen }: { rows: SwitchRow[]; onOpen: (r: SwitchRow) => void }) {
  return (
    <div className="mt-3">
      <DataTable
        columns={[
          { label: "Title" },
          { label: "Group", phone: false },
          { label: "Quality", phone: false },
          { label: "Codec", phone: false },
          { label: "Audio", phone: false },
          { label: "Size", align: "right", phone: false },
          { label: "Change", align: "right" },
        ]}
      >
        {rows.map((r) => {
          const attrs = attributes(r.unit, r.alt);
          const extras = [
            r.alt.pack ? "pack" : r.alt.episodes > 1 ? plural(r.alt.episodes, "episode") : null,
            r.unit.files > 1 ? plural(r.unit.files, "file") : null,
          ].filter(Boolean);
          return (
            <tr key={r.unit.key} className={ROW}>
              <td className="w-full max-w-0 px-3 py-2">
                <div className="flex min-w-0 items-baseline gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpen(r)}
                    className="truncate text-left font-medium transition-colors hover:text-primary"
                  >
                    {r.unit.title}
                  </button>
                  <span className={cn("shrink-0 text-xs text-muted-foreground", r.unit.season === null && "font-num")}>
                    {metaOf(r)}
                  </span>
                  {extras.length ? (
                    <span className="shrink-0 text-xs text-muted-foreground">· {extras.join(" · ")}</span>
                  ) : null}
                </div>
                <div className={cn(NAME_LINE, "text-muted-foreground/50 max-sm:hidden")} title={r.unit.fileName}>
                  {withoutTitle(r.unit.fileName.replace(/\.\w{2,4}$/, ""))}
                </div>
                <div className={cn(NAME_LINE, "text-muted-foreground")} title={r.alt.name}>
                  {nameParts(withoutTitle(r.alt.name), attrs).map((p, i) => {
                    const a = p.key && attrs.find((x) => x.key === p.key);
                    return a ? (
                      <span key={i} className={toneOf(a)}>
                        <Breakable text={p.text} />
                      </span>
                    ) : (
                      <Breakable key={i} text={p.text} />
                    );
                  })}
                </div>
              </td>
              {attrs.map((a) => (
                <td key={a.key} className={cn(MUTED_CELL, NOT_ON_PHONE)} title={a.same ? undefined : `Now ${a.before}`}>
                  {a.after}
                </td>
              ))}
              <td className={cn(NUMBER_CELL, NOT_ON_PHONE)} title={`Now ${formatBytes(r.unit.size)}`}>
                {r.alt.size === null ? "?" : formatBytes(r.alt.size)}
              </td>
              <td
                className={cn(
                  NUMBER_CELL,
                  r.change !== null && r.change < 0 && "text-success",
                  r.change !== null && r.change > 0 && "text-destructive",
                )}
              >
                {formatChange(r.change)}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </div>
  );
}
