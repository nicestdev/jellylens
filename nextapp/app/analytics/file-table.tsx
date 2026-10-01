"use client";

import { useEffect, useState, type Ref } from "react";
import { AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FilterChips, FilterMenu } from "@/components/filter-menu";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { FilesResponse } from "@/lib/api-types";
import { toggled, type SortDir } from "@/lib/facets";
import { episodeCode, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  FILE_SORTS,
  codecName,
  filesUrl,
  groupName,
  languageLabel,
  pageText,
  resolutionName,
  type Dimension,
  type FileSortKey,
  type Library,
  type ListFilters,
  type fileFacets,
} from "./logic";

const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";

// The filter menu's sections, in order, with how each names its values.
const FACETS: { dimension: Dimension; label: string; format: (v: string) => string; chip: string }[] = [
  { dimension: "groups", label: "Group", format: groupName, chip: "group" },
  { dimension: "resolutions", label: "Resolution", format: resolutionName, chip: "res" },
  { dimension: "codecs", label: "Codec", format: codecName, chip: "codec" },
  { dimension: "languages", label: "Audio", format: languageLabel, chip: "audio" },
];

// Every file of a library, searched, filtered by group, resolution, codec
// and audio language, sorted and paged on the server (/api/analytics/files), a moment
// after typing stops; the last page stays, dimmed, while the next loads.
// The filters are the page's, since a click in the share chart sets them
// too; facets: the menu's values and counts. The list goes back to its
// first page whenever what's listed changes. version: bumped after a
// sync, to load again.
export function FileTable({
  library,
  facets,
  filters,
  onFilter,
  version,
  ref,
}: {
  library: Library;
  facets: ReturnType<typeof fileFacets>;
  filters: ListFilters;
  onFilter: (dimension: Dimension, values: Set<string>) => void;
  version?: string | null;
  ref?: Ref<HTMLElement>;
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<FileSortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const listing = filesUrl(library, query, filters, sortKey, sortDir, 0);
  const [paging, setPaging] = useState({ listing, offset: 0 });
  const offset = paging.listing === listing ? paging.offset : 0;
  const url = filesUrl(library, query, filters, sortKey, sortDir, offset);

  const [data, setData] = useState<{ url: string; offset: number; res: FilesResponse } | null>(null);
  const [error, setError] = useState("");
  const loading = data?.url !== url;

  useEffect(() => {
    let cancelled = false;
    const debounce = setTimeout(async () => {
      try {
        const res = await apiFetch<FilesResponse>(url);
        if (cancelled) return;
        setData({ url, offset, res });
        setError("");
      } catch (e) {
        if (!cancelled) setError(`Failed to load files: ${(e as Error).message}`);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [url, offset, version]);

  const res = data?.res;
  const items = res?.Items ?? [];
  const pageSize = res?.pageSize ?? 50;
  const matched = res?.matched ?? 0;
  const shownOffset = data?.offset ?? 0;
  const pages = Math.max(1, Math.ceil(matched / pageSize));
  const page = Math.floor(shownOffset / pageSize);
  const goTo = (n: number) => setPaging({ listing, offset: n * pageSize });
  const toggle = (dimension: Dimension, value: string) => onFilter(dimension, toggled(filters[dimension], value));

  const chips = FACETS.flatMap(({ dimension, format, chip }) =>
    [...filters[dimension]].map((v) => ({ id: `${chip}-${v}`, label: format(v), onRemove: () => toggle(dimension, v) }))
  );

  return (
    <section ref={ref} className="mt-8 scroll-mt-20">
      <h2 className="text-sm font-medium text-muted-foreground">Files</h2>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={library === "shows" ? "Search shows, episodes and files…" : "Search titles and files…"}
          className="w-full sm:w-64"
        />
        <FilterMenu
          facets={FACETS.map(({ dimension, label, format }) => ({
            key: dimension,
            label,
            values: facets[dimension].values,
            counts: facets[dimension].counts,
            selected: filters[dimension],
            onToggle: (v: string) => toggle(dimension, v),
            format,
          }))}
        />
        <div className="ml-auto">
          <SortMenu
            options={FILE_SORTS}
            sortKey={sortKey}
            sortDir={sortDir}
            onChange={(key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            }}
          />
        </div>
      </div>
      <FilterChips chips={chips} onClear={() => FACETS.forEach((f) => onFilter(f.dimension, new Set()))} />

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        aria-busy={loading}
        className={cn("mt-3 overflow-hidden rounded-xl border bg-card transition-opacity", loading && data && "opacity-60")}
      >
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Title</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Resolution</th>
              <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Codec</th>
              <th className="hidden px-3 py-2 text-left font-medium md:table-cell">Audio</th>
              <th className={cn(num, "font-medium")}>Size</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((f) => {
              const href = tmdbUrl(library === "shows" ? "tv" : "movie", f.tmdbId ?? undefined);
              const code = episodeCode(f.season, f.episode, f.episodeEnd);
              return (
                <tr key={f.key}>
                  <td className="w-full max-w-0 px-3 py-2">
                    <div className="truncate">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium hover:underline">
                          {f.title}
                        </a>
                      ) : (
                        <span className="font-medium">{f.title}</span>
                      )}
                      {code ? (
                        <span className="ml-1.5 text-muted-foreground">
                          <span className="tabular-nums">{code}</span>
                          {f.episodeTitle ? ` · ${f.episodeTitle}` : null}
                        </span>
                      ) : f.year ? (
                        <span className="ml-1.5 text-muted-foreground">{f.year}</span>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground" title={f.fileName}>
                      {f.fileName}
                    </div>
                  </td>
                  <td className={cn("px-3 py-2 whitespace-nowrap", !f.group && "text-muted-foreground")}>
                    {groupName(f.group ?? "")}
                  </td>
                  <td className="hidden px-3 py-2 whitespace-nowrap text-muted-foreground sm:table-cell">
                    {resolutionName(f.resolution)}
                  </td>
                  <td className="hidden px-3 py-2 whitespace-nowrap text-muted-foreground sm:table-cell">
                    {codecName(f.codec)}
                  </td>
                  <td
                    className="hidden px-3 py-2 whitespace-nowrap text-muted-foreground md:table-cell"
                    title={f.languages.map(languageLabel).join(", ") || undefined}
                  >
                    {f.languages.join(", ") || "–"}
                  </td>
                  <td className={num}>{formatBytes(f.size)}</td>
                </tr>
              );
            })}
            {res && !items.length ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No files match. Try a different search or remove a filter.
                </td>
              </tr>
            ) : null}
            {!res ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{res ? pageText(shownOffset, items.length, matched) : ""}</span>
        {pages > 1 ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Previous page" disabled={page === 0} onClick={() => goTo(page - 1)}>
              <ChevronLeft />
            </Button>
            <span className="tabular-nums">
              Page {page + 1} of {pages}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Next page"
              disabled={page >= pages - 1}
              onClick={() => goTo(page + 1)}
            >
              <ChevronRight />
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
