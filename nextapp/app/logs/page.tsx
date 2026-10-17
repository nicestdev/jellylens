"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, ScrollText, SearchX } from "lucide-react";
import { Dots } from "@/components/dot";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { FacetMenu, FilterChips } from "@/components/filter-menu";
import { CELL, type Column, MUTED_CELL, NOT_ON_PHONE, ROW } from "@/components/library-table";
import { TableFrame } from "@/components/section-frame";
import { LoadMore } from "@/components/load-more";
import { PageMenu } from "@/components/page-menu";
import { PageActions } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePoll } from "@/hooks/use-poll";
import { apiFetch } from "@/lib/api-client";
import type { LogEntry, LogsResponse } from "@/lib/api-types";
import { toggled } from "@/lib/facets";
import { toast } from "@/lib/toast";
import { LOG_AREAS, areaLabel } from "@/lib/log-areas";
import { cn } from "@/lib/utils";
import { LEVELS, copyText, levelLabel, logTime, logDays, logsQuery } from "./logic";

// Fixed widths, so the days' tables line up.
const COLUMNS: Column[] = [
  { label: "Message" },
  { label: "Level", width: "w-24", phone: false },
  { label: "Area", width: "w-28", phone: false },
  { label: "Time", width: "w-40", align: "right", phone: false },
];

const LEVEL_TEXT: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  info: "text-muted-foreground",
};

// The app's log (lib/log.ts, the last 14 days), newest first, a table a
// day: a search,
// a Level and an Area menu, older lines as it's scrolled, new ones every
// 5 s. The page's ⋯ copies what's shown, to hand on.
export default function LogsPage() {
  const [query, setQuery] = useState("");
  const [levels, setLevels] = useState<Set<string>>(() => new Set());
  const [areas, setAreas] = useState<Set<string>>(() => new Set());
  const [entries, setEntries] = useState<LogEntry[] | null>(null);
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  // The filters' answers count only while they're the filters.
  const seq = useRef(0);
  const filters = { q: query, levels, areas };

  const fetchPage = useCallback(async (f: typeof filters, page: string) => {
    return apiFetch<LogsResponse>(logsQuery(f, page));
  }, []);

  useEffect(() => {
    const n = ++seq.current;
    const timer = setTimeout(
      () =>
        fetchPage({ q: query, levels, areas }, "").then(
          (res) => {
            if (n !== seq.current) return;
            setEntries(res.entries);
            setMore(res.more);
            setError("");
          },
          (e: Error) => n === seq.current && setError(e.message),
        ),
      query ? 250 : 0,
    );
    return () => clearTimeout(timer);
  }, [query, levels, areas, fetchPage]);

  usePoll(async () => {
    const n = seq.current;
    const newest = entries?.[0]?.id;
    if (newest === undefined) return;
    const res = await fetchPage(filters, `after=${newest}`);
    if (n === seq.current && res.entries.length) setEntries((list) => [...res.entries, ...(list ?? [])]);
  }, 5000);

  async function loadOlder() {
    const n = seq.current;
    const oldest = entries?.at(-1)?.id;
    if (oldest === undefined) return;
    setLoadingMore(true);
    try {
      const res = await fetchPage(filters, `before=${oldest}`);
      if (n !== seq.current) return;
      setEntries((list) => [...(list ?? []), ...res.entries]);
      setMore(res.more);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText(entries ?? []));
      toast("Copied", { description: `${entries?.length ?? 0} lines` });
    } catch (e) {
      setError(`Couldn't copy: ${(e as Error).message}`);
    }
  }

  const filtered = Boolean(query.trim() || levels.size || areas.size);

  return (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-3xl font-semibold max-md:sr-only">Logs</h1>
        <PageActions>
          <PageMenu groups={[[{ icon: Copy, label: "Copy", onClick: copy, disabled: !entries?.length }]]} />
        </PageActions>
      </div>

      {error ? <ErrorAlert>{error}</ErrorAlert> : null}

      <div className="flex flex-wrap items-center gap-2 md:mt-6">
        <SearchInput value={query} onChange={setQuery} placeholder="Search the log" size="lg" grow />
        <FacetMenu
          className="phone-portrait:hidden"
          facet={{
            key: "level",
            label: "Level",
            values: LEVELS,
            selected: levels,
            onToggle: (l) => setLevels((prev) => toggled(prev, l)),
            format: levelLabel,
          }}
        />
        <FacetMenu
          className="phone-portrait:hidden"
          facet={{
            key: "area",
            label: "Area",
            values: [...LOG_AREAS],
            selected: areas,
            onToggle: (a) => setAreas((prev) => toggled(prev, a)),
            format: areaLabel,
          }}
        />
      </div>
      <FilterChips
        chips={[
          ...[...levels].map((l) => ({
            id: "level:" + l,
            label: levelLabel(l),
            onRemove: () => setLevels((prev) => toggled(prev, l)),
          })),
          ...[...areas].map((a) => ({
            id: "area:" + a,
            label: areaLabel(a),
            onRemove: () => setAreas((prev) => toggled(prev, a)),
          })),
        ]}
        onClear={() => {
          setLevels(new Set());
          setAreas(new Set());
        }}
      />

      <div className="mt-4 md:mt-6">
        {entries?.length === 0 ? (
          filtered ? (
            <EmptyState icon={SearchX} title="Nothing found" hint="No line matches. Try removing a filter." />
          ) : (
            <EmptyState icon={ScrollText} title="Nothing logged yet" hint="Lines come in as the app works." />
          )
        ) : (
          <div className="flex flex-col gap-4 sm:gap-6">
            {entries === null ? (
              <TableFrame title="Today" columns={COLUMNS}>
                {Array.from({ length: 8 }, (_, i) => (
                  <tr key={i} className={ROW}>
                    <td colSpan={4} className={CELL}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}
              </TableFrame>
            ) : (
              logDays(entries).map((day) => (
                <TableFrame key={day.label} title={day.label} columns={COLUMNS}>
                  {day.entries.map((e) => (
                    <tr key={e.id} className={cn(ROW, "align-baseline")}>
                      <td className={cn(CELL, "whitespace-normal")}>
                        <div
                          className={cn(
                            "font-mono text-xs [overflow-wrap:anywhere]",
                            e.level !== "info" && LEVEL_TEXT[e.level],
                          )}
                        >
                          {e.message}
                        </div>
                        <div className="text-xs text-muted-foreground tabular-nums sm:hidden">
                          <Dots
                            parts={[
                              <span key="level" className={LEVEL_TEXT[e.level]}>
                                {levelLabel(e.level)}
                              </span>,
                              areaLabel(e.area),
                              logTime(e.at),
                            ]}
                          />
                        </div>
                      </td>
                      <td className={cn(CELL, NOT_ON_PHONE, LEVEL_TEXT[e.level])}>{levelLabel(e.level)}</td>
                      <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{areaLabel(e.area)}</td>
                      <td className={cn(MUTED_CELL, NOT_ON_PHONE, "text-right tabular-nums")}>{logTime(e.at)}</td>
                    </tr>
                  ))}
                </TableFrame>
              ))
            )}
          </div>
        )}
        {more ? <LoadMore shown={entries?.length ?? 0} onMore={loadOlder} loading={loadingMore} /> : null}
      </div>
    </main>
  );
}
