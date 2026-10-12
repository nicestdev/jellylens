"use client";

import { useEffect, useState } from "react";
import { Breakable } from "@/components/breakable";
import { LoadMore } from "@/components/load-more";
import { CELL, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { TableFrame } from "@/components/section-frame";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { FilesResponse } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";
import { episodeCode, formatBytes, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Library } from "@/lib/libraries";
import { FILE_SORTS, filesUrl, pageText, type FileSortKey } from "./logic";
import { ErrorAlert } from "@/components/error-alert";

// Size, at the right like the lists' numbers.
const num = NUMBER_CELL;
// A file's title, as a release's name on a title page.
const NAME = "font-medium";

// Every file of a library, to look up exactly which file you have of a
// title: its name, then its group, resolution, codec and audio (the
// charts' dimensions; left out on phones, where the name has them) and
// size. Searched, sorted and paged on the server (/api/analytics/files), a
// moment after typing stops; the list stays, dimmed, while the new one
// loads, and further pages load as it's scrolled to the end. version:
// bumped after a sync, to load again.
export function FileTable({ library, version }: { library: Library; version?: string | null }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<FileSortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const url = filesUrl(library, query, sortKey, sortDir, 0);

  // The first page of what's listed, and the pages scrolled in after it.
  const [data, setData] = useState<{ url: string; res: FilesResponse; items: FilesResponse["items"] } | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const loading = data?.url !== url;

  useEffect(() => {
    let cancelled = false;
    const debounce = setTimeout(async () => {
      try {
        const res = await apiFetch<FilesResponse>(url);
        if (cancelled) return;
        setData({ url, res, items: res.items });
        setError("");
      } catch (e) {
        if (!cancelled) setError(`Failed to load files: ${(e as Error).message}`);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
    };
  }, [url, version]);

  // The next page, kept only if the list is still the one it continues.
  async function showMore() {
    if (loadingMore || !data || loading) return;
    const from = data;
    setLoadingMore(true);
    try {
      const res = await apiFetch<FilesResponse>(filesUrl(library, query, sortKey, sortDir, from.items.length));
      setData((d) => (d === from ? { ...d, items: [...d.items, ...res.items] } : d));
    } catch (e) {
      setError(`Failed to load files: ${(e as Error).message}`);
    } finally {
      setLoadingMore(false);
    }
  }

  const res = data?.res;
  const items = data?.items ?? [];
  const matched = res?.matched ?? 0;

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={library === "shows" ? "Search shows, episodes and files" : "Search titles and files"}
          size="lg"
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

      {error ? <ErrorAlert className="mt-3">{error}</ErrorAlert> : null}

      <TableFrame
        title="Files"
        count={res ? formatNumber(matched) : undefined}
        busy={loading}
        className={cn("mt-3.5 transition-opacity", loading && data && "opacity-60")}
        columns={[
          { label: "Title", stretch: true },
          { label: "Group", width: "w-28", phone: false },
          { label: "Quality", width: "w-22", phone: false },
          { label: "Codec", width: "w-20", phone: false },
          { label: "Audio", width: "w-28", phone: false },
          { label: "Size", align: "right", width: "w-[6.875rem]" },
        ]}
      >
        {items.map((f) => {
          const href = tmdbUrl(library === "shows" ? "tv" : "movie", f.tmdbId ?? undefined);
          const code = episodeCode(f.season, f.episode, f.episodeEnd);
          return (
            <tr key={f.key} className={cn(ROW, "h-17")}>
              <td className={cn(CELL, "max-w-0")}>
                <div className="truncate">
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(NAME, "transition-colors hover:text-bright")}
                    >
                      {f.title}
                    </a>
                  ) : (
                    <span className={NAME}>{f.title}</span>
                  )}
                  {code ? (
                    <span className="ml-1.5 text-muted-foreground">
                      <span className="tabular-nums">{code}</span>
                      {f.episodeTitle ? ` · ${f.episodeTitle}` : null}
                    </span>
                  ) : f.year ? (
                    <span className="ml-1.5 text-muted-foreground tabular-nums">{f.year}</span>
                  ) : null}
                </div>
                <div className="mt-[3px] font-mono text-xs [overflow-wrap:anywhere] text-muted-foreground sm:truncate">
                  <Breakable text={f.fileName} />
                </div>
              </td>
              <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{f.group ?? "—"}</td>
              <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{f.resolution || "—"}</td>
              <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{f.codec || "—"}</td>
              <td className={cn(MUTED_CELL, NOT_ON_PHONE)}>{f.languages.join(" · ") || "—"}</td>
              <td className={num}>{formatBytes(f.size)}</td>
            </tr>
          );
        })}
        {res && !items.length ? (
          <tr className={ROW}>
            <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
              No files match. Try a different search.
            </td>
          </tr>
        ) : null}
        {!res ? (
          <tr className={ROW}>
            <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
              Loading
            </td>
          </tr>
        ) : null}
      </TableFrame>

      {res && items.length < matched && !loading ? (
        <LoadMore shown={items.length} onMore={showMore} loading={loadingMore} />
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{res ? pageText(0, items.length, matched) : ""}</p>
    </section>
  );
}
