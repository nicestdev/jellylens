"use client";

import { useEffect, useMemo, useState } from "react";
import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { FilterChips, FilterMenu, type Facet } from "@/components/filter-menu";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { StatTile } from "@/components/stat-tile";
import type { UpgradesResponse } from "@/lib/api-types";
import { toggled, type SortDir } from "@/lib/facets";
import { plural } from "@/lib/format";
import { ChipsList } from "./chips-list";
import {
  CODEC_PICKS,
  QUALITY_PICKS,
  SWITCH_SORTS,
  UNIT,
  fromFacet,
  panelFor,
  searchRows,
  sortRows,
  switchSummary,
  switchTiles,
  startChoices,
  targetGroups,
  type Library,
  type PanelFor,
  type Choices,
  type CodecPick,
  type QualityPick,
  type SwitchSortKey,
} from "./logic";

const PAGE = 50;

// The target group, quality and codec picked last, per library, in this
// browser only. Storage can be blocked (private windows); then the page
// just starts with the defaults.
const choicesKey = (library: Library) => `jellylens.upgrades.${library}`;
function savedChoices(library: Library): unknown {
  try {
    return JSON.parse(localStorage.getItem(choicesKey(library)) ?? "null");
  } catch {
    return null;
  }
}
function saveChoices(library: Library, choices: Choices) {
  try {
    localStorage.setItem(choicesKey(library), JSON.stringify(choices));
  } catch {}
}

// Which of your movies or seasons a group you'd like more of (the target)
// has released, in the quality and codec you pick, and what swapping them
// would cost in storage. Source narrows it to what you have from some
// groups now; "adds original audio" to DL and ML releases where your file
// has one language.
export function SwitchView({
  library,
  data,
  onOpen,
}: {
  library: Library;
  data: UpgradesResponse;
  onOpen: (p: PanelFor) => void;
}) {
  const groups = useMemo(() => targetGroups(data.favorites), [data.favorites]);
  const [start] = useState(() => startChoices(groups, savedChoices(library)));
  const [target, setTarget] = useState(start.target);
  const [from, setFrom] = useState<Set<string>>(new Set());
  const [quality, setQuality] = useState<QualityPick>(start.quality);
  const [codec, setCodec] = useState<CodecPick>(start.codec);
  useEffect(() => saveChoices(library, { target, quality, codec }), [library, target, quality, codec]);
  const [onlyAudio, setOnlyAudio] = useState(false);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SwitchSortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [shown, setShown] = useState(PAGE);

  const options = useMemo(
    () => ({ target, from, quality, codec, onlyAudio }),
    [target, from, quality, codec, onlyAudio]
  );
  const summary = useMemo(() => switchSummary(data.units, options), [data.units, options]);
  const rows = useMemo(
    () => sortRows(searchRows(summary.rows, query), sortKey, sortDir),
    [summary.rows, query, sortKey, sortDir]
  );
  const facet = fromFacet(data, target);
  const unit = UNIT[library].one;

  const pickGroup = (v: string) => {
    setTarget(v);
    setFrom(new Set());
  };
  const qualityName = (k: string) => QUALITY_PICKS.find((q) => q.key === k)?.label ?? k;
  const codecName = (k: string) => CODEC_PICKS.find((c) => c.key === k)?.label ?? k;

  // Everything in the one filter menu, like the other pages: the target
  // group (the one to switch to), quality and codec are picked one of
  // each; source groups (what you have now) and "adds original audio" are checked.
  const facets: Facet[] = [
    { key: "group", label: "Target", values: groups, selected: new Set([target]), onToggle: pickGroup, single: true },
    {
      key: "from",
      label: "Source",
      values: facet.values,
      counts: facet.counts,
      selected: from,
      onToggle: (v) => setFrom(toggled(from, v)),
      format: (v) => facet.names.get(v) ?? v,
    },
    {
      key: "quality",
      label: "Quality",
      values: QUALITY_PICKS.map((q) => q.key),
      selected: new Set([quality]),
      onToggle: (v) => setQuality(v as QualityPick),
      format: qualityName,
      single: true,
      changed: quality !== "same",
    },
    {
      key: "codec",
      label: "Codec",
      values: CODEC_PICKS.map((c) => c.key),
      selected: new Set([codec]),
      onToggle: (v) => setCodec(v as CodecPick),
      format: codecName,
      single: true,
      changed: codec !== "any",
    },
    {
      key: "audio",
      label: "Audio",
      values: ["dl"],
      selected: onlyAudio ? new Set(["dl"]) : new Set(),
      onToggle: () => setOnlyAudio(!onlyAudio),
      format: () => "Adds original audio",
    },
  ];

  // What's off its default, removable; the group shows in the tiles.
  const chips = [
    ...(quality !== "same"
      ? [{ id: "quality", label: quality === "any" ? "Any quality" : quality, onRemove: () => setQuality("same") }]
      : []),
    ...(codec !== "any"
      ? [{ id: "codec", label: codec === "same" ? "Same codec" : codec, onRemove: () => setCodec("any") }]
      : []),
    ...(onlyAudio ? [{ id: "audio", label: "+ Original audio", onRemove: () => setOnlyAudio(false) }] : []),
    ...[...from].map((v) => ({
      id: `from-${v}`,
      label: `from ${facet.names.get(v) ?? v}`,
      onRemove: () => setFrom(toggled(from, v)),
    })),
  ];
  const clearAll = () => {
    setQuality("same");
    setCodec("any");
    setOnlyAudio(false);
    setFrom(new Set());
  };

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {switchTiles(summary, options, library).map((t) => (
          <StatTile key={t.label} {...t} />
        ))}
      </div>

      <section className="mt-8">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Search titles…" className="w-full sm:w-64" />
          <FilterMenu facets={facets} />
          <div className="ml-auto">
            <SortMenu
              options={SWITCH_SORTS}
              sortKey={sortKey}
              sortDir={sortDir}
              onChange={(k, d) => {
                setSortKey(k);
                setSortDir(d);
              }}
            />
          </div>
        </div>
        <FilterChips chips={chips} onClear={clearAll} />

        {rows.length ? (
          <ChipsList rows={rows.slice(0, shown)} onOpen={(r) => onOpen(panelFor(r.unit, options, library))} />
        ) : (
          <div className="mt-3">
            <EmptyState
              icon={PackageSearch}
              title={`Nothing from ${target}`}
              hint={
                query
                  ? "No title matches the search."
                  : `${target} has none of these ${unit}s${quality === "same" ? " in the quality you have" : ""}. Try another quality, codec or group.`
              }
            />
          </div>
        )}
        {rows.length > shown ? (
          <div className="mt-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setShown(shown + PAGE)}>
              Show more ({plural(rows.length - shown, unit)} left)
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
