"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ArrowRightLeft, ArrowUpRight, RefreshCw, SearchX } from "lucide-react";
import { Dot, Dots } from "@/components/dot";
import { EmptyState } from "@/components/empty-state";
import { LoadMore } from "@/components/load-more";
import { ErrorAlert } from "@/components/error-alert";
import { FacetMenu, FilterChips } from "@/components/filter-menu";
import { CELL, type Column, ROW, TITLE_CELL } from "@/components/library-table";
import { PageMenu } from "@/components/page-menu";
import { PageActions } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { TableFrame } from "@/components/section-frame";
import { SortMenu } from "@/components/sort-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoad } from "@/hooks/use-load";
import { usePoll } from "@/hooks/use-poll";
import { apiFetch } from "@/lib/api-client";
import type { MigrationsResponse } from "@/lib/api-types";
import { toggled, type SortDir } from "@/lib/facets";
import { formatBytes, seasonCode } from "@/lib/format";
import { titlePath } from "@/lib/title-path";
import { cn } from "@/lib/utils";
import {
  MIGRATION_SORTS,
  NO_MIGRATION,
  TYPES,
  migrationView,
  rowKey,
  sourcesOf,
  typeLabel,
  pickLabel,
  sizeTone,
  splitPick,
  withNots,
  type MigrationSortKey,
} from "./logic";

// A release's links, each after a dot with an arrow.
function Links({ links }: { links: { label: string; href: string }[] }) {
  return links.map((l) => (
    <Fragment key={l.label}>
      <Dot />
      <a
        href={l.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex shrink-0 items-center gap-0.5 self-center transition-colors hover:text-bright"
      >
        {l.label}
        <ArrowUpRight className="size-3" />
      </a>
    </Fragment>
  ));
}

// One column: the title, what the library has and the target's releases
// in lines under it.
const COLUMNS: Column[] = [{ label: "Title" }];
const PAGE = 100;

const load = () => apiFetch<MigrationsResponse>("/api/migrations");

// An offer's size: green when smaller than what the library has, red when bigger.
const TONE = { better: "text-success", worse: "text-destructive", none: "" };

// Administration › Migrations: the movies and seasons the library has that
// a target group offers too, a row per title and target: from anyone else
// (to replace), or the target's own WEB it has a BluRay of by now (to
// upgrade). Targets: the DLoad uploaders' groups (their threads, kept by
// the DLoad sync) and the favorite P2P groups (their xREL releases). A row: the title (to
// its page) with the target's release names under it, each with its links
// after a dot (DLoad, xREL, FunXD), over them the library's groups (the
// source) → the target, quality and size; one column. A search, Type,
// Source and Target (each with its nots and qualities) menus, Size or Title; the ⋯ syncs DLoad's threads now.
export default function MigrationsPage() {
  const page = useLoad(load);
  const data = page.data;
  const dload = data?.dload;
  const [query, setQuery] = useState("");
  // Source and Target: groups and "!group" nots (withNots in logic.ts).
  const [sourcePick, setSourcePick] = useState<Set<string>>(() => new Set());
  const [targetPick, setTargetPick] = useState<Set<string>>(() => new Set());
  const [types, setTypes] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: MigrationSortKey; dir: SortDir }>({ key: "size", dir: "desc" });
  const [actionError, setError] = useState("");
  // Rows rendered, a page more as the list is scrolled near its end (some
  // thousand at once make the page slow, a phone turned too); back to one
  // page whenever the view changes.
  const [paging, setPaging] = useState({ view: "", limit: PAGE });
  const error = actionError || dload?.error || (page.error && `Failed to load: ${page.error}`);
  usePoll(page.reload, dload?.running ? 2000 : 30_000);

  async function sync() {
    setError("");
    try {
      await apiFetch("/api/sync/dload", { method: "POST" });
      await page.reload();
    } catch (e) {
      setError(`Sync failed: ${(e as Error).message}`);
    }
  }

  const sources = data ? sourcesOf(data.rows) : [];
  const from = splitPick(sourcePick);
  const to = splitPick(targetPick);
  const filters = {
    query,
    types,
    sources: from.yes,
    notSources: from.no,
    sourceQualities: from.qualities,
    targets: to.yes,
    notTargets: to.no,
    targetQualities: to.qualities,
    noMigration: to.none,
  };
  const shown = data ? migrationView(data.rows, filters, sort.key, sort.dir) : null;
  const filtered = Boolean(query.trim() || types.size || sourcePick.size || targetPick.size);
  const view = JSON.stringify([query, [...sourcePick], [...targetPick], [...types], sort]);
  const limit = paging.view === view ? paging.limit : PAGE;
  const groupMenus = [
    {
      key: "source",
      label: "Source",
      names: sources,
      extra: [],
      picked: sourcePick,
      set: setSourcePick,
      chip: ["From", "Not from"],
    },
    {
      key: "target",
      label: "Target",
      names: data?.targets ?? [],
      extra: [NO_MIGRATION],
      picked: targetPick,
      set: setTargetPick,
      chip: ["To", "Not to"],
    },
  ];

  return (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold max-md:sr-only">Migrations</h1>
        <PageActions>
          <PageMenu groups={[[{ icon: RefreshCw, label: "Sync DLoad", onClick: sync, disabled: dload?.running }]]} />
        </PageActions>
      </div>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <div className="flex flex-wrap items-center gap-2 md:mt-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search titles and groups" size="lg" grow />
        <FacetMenu
          className="phone-portrait:hidden"
          facet={{
            key: "type",
            label: "Type",
            values: [...TYPES],
            selected: types,
            onToggle: (t) => setTypes((prev) => toggled(prev, t)),
            format: typeLabel,
          }}
        />
        {groupMenus.map((m) => (
          <FacetMenu
            key={m.key}
            className="phone-portrait:hidden"
            facet={{
              key: m.key,
              label: m.label,
              values: [...withNots(m.names), ...m.extra],
              selected: m.picked,
              onToggle: (v) => m.set((prev) => toggled(prev, v)),
              format: pickLabel,
              divideAfter: [m.names.length, m.names.length * 2, withNots(m.names).length],
            }}
          />
        ))}
        <SortMenu
          className="ml-auto phone-portrait:hidden"
          options={[...MIGRATION_SORTS]}
          sortKey={sort.key}
          sortDir={sort.dir}
          onChange={(key, dir) => setSort({ key, dir })}
        />
      </div>
      <FilterChips
        chips={[
          ...groupMenus.flatMap((m) =>
            [...m.picked].map((v) => ({
              id: `${m.key}:${v}`,
              label:
                v === NO_MIGRATION
                  ? pickLabel(v)
                  : v.startsWith("!")
                    ? `${m.chip[1]} ${v.slice(1)}`
                    : `${m.chip[0]} ${pickLabel(v)}`,
              onRemove: () => m.set((prev) => toggled(prev, v)),
            })),
          ),
          ...[...types].map((t) => ({
            id: t,
            label: typeLabel(t),
            onRemove: () => setTypes((prev) => toggled(prev, t)),
          })),
        ]}
        onClear={() => {
          setSourcePick(new Set());
          setTargetPick(new Set());
          setTypes(new Set());
        }}
      />

      <div className="mt-4 md:mt-6">
        {shown?.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="Nothing found" hint="No title matches. Try removing a filter." />
          ) : (
            <EmptyState
              icon={ArrowRightLeft}
              title="Nothing to migrate"
              hint="No target offers anything the library has."
            />
          )
        ) : (
          <TableFrame title="Migrations" count={shown?.length} columns={COLUMNS} busy={dload?.running}>
            {shown === null
              ? Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className={ROW}>
                    <td className={CELL}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              : shown.slice(0, limit).map((r) => (
                  <tr key={rowKey(r)} className={cn(ROW, "h-auto align-baseline")}>
                    <td className={cn(TITLE_CELL, "py-2")}>
                      <div className="flex items-baseline gap-1.5">
                        <Link href={titlePath(`${r.type}:${r.tmdbId}`)} className="min-w-0 truncate font-medium">
                          {r.title}
                        </Link>
                        <span className="shrink-0 text-muted-foreground">
                          <Dots parts={[r.season !== null ? seasonCode(r.season) : r.year]} />
                        </span>
                      </div>
                      {/* What the library has, its release names in peach, a DLoad uploader's with their thread. */}
                      {r.have.map((h) => (
                        <div key={h.name} className="flex items-baseline gap-1.5 text-xs text-warning">
                          <span className="min-w-0 truncate font-mono">{h.name}</span>
                          <Dot />
                          <span className="shrink-0 tabular-nums">{formatBytes(h.size)}</span>
                          <Links links={h.links} />
                        </div>
                      ))}
                      {/* The target's releases, each name with its links after a dot. */}
                      {r.offers.map((o) => (
                        <div key={o.name} className="flex items-baseline gap-1.5 text-xs text-muted-foreground">
                          <span className="min-w-0 truncate font-mono">{o.name}</span>
                          {o.size !== null ? (
                            <>
                              <Dot />
                              <span className={cn("shrink-0 tabular-nums", TONE[sizeTone(o, r.size) ?? "none"])}>
                                {formatBytes(o.size)}
                              </span>
                            </>
                          ) : null}
                          <Links links={o.links} />
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
          </TableFrame>
        )}
        {shown && shown.length > limit ? (
          <LoadMore shown={limit} onMore={() => setPaging({ view, limit: limit + PAGE })} />
        ) : null}
      </div>
    </main>
  );
}
