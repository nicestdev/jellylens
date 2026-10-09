"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breakable } from "@/components/breakable";
import { LoadMore } from "@/components/load-more";
import { CELL, MUTED_CELL, NOT_ON_PHONE, NUMBER_CELL, ROW } from "@/components/library-table";
import { SearchInput } from "@/components/search-input";
import { SortMenu } from "@/components/sort-menu";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import type { FilesResponse } from "@/lib/api-types";
import type { SortDir } from "@/lib/facets";
import { episodeCode, formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Library } from "@/lib/libraries";
import { FILE_SORTS, filesUrl, pageText, type FileSortKey } from "./logic";

// Size, at the right like the lists' numbers.
const num = NUMBER_CELL;

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
  const [data, setData] = useState<{ url: string; res: FilesResponse; items: FilesResponse["Items"] } | null>(null);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const loading = data?.url !== url;

  useEffect(() => {
    let cancelled = false;
    const debounce = setTimeout(async () => {
      try {
        const res = await apiFetch<FilesResponse>(url);
        if (cancelled) return;
        setData({ url, res, items: res.Items });
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
      setData((d) => (d === from ? { ...d, items: [...d.items, ...res.Items] } : d));
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
    <section className="mt-8">
      <h2 className="text-sm font-medium text-muted-foreground">Files</h2>
      <div className="mt-3 flex items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={library === "shows" ? "Search shows, episodes and files…" : "Search titles and files…"}
          className="min-w-0 flex-1 sm:w-64 sm:flex-none"
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

      {error ? (
        <Alert variant="destructive" className="mt-3">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div
        aria-busy={loading}
        className={cn("mt-3 overflow-hidden rounded-lg border transition-opacity", loading && data && "opacity-60")}
      >
        <table className="w-full border-collapse text-[13px]">
          {/* Not on a phone, like the other tables: the rows say it all. */}
          <thead className="max-sm:hidden">
            <tr className="bg-card text-left text-xs text-muted-foreground">
              <th className={cn(CELL, "font-medium")}>Title</th>
              <th className={cn(CELL, NOT_ON_PHONE, "font-medium")}>Group</th>
              <th className={cn(CELL, NOT_ON_PHONE, "font-medium")}>Quality</th>
              <th className={cn(CELL, NOT_ON_PHONE, "font-medium")}>Codec</th>
              <th className={cn(CELL, NOT_ON_PHONE, "font-medium")}>Audio</th>
              <th className={cn(num, "font-medium")}>Size</th>
            </tr>
          </thead>
          <tbody className="max-sm:[&>tr:first-child]:border-t-0">
            {items.map((f) => {
              const href = tmdbUrl(library === "shows" ? "tv" : "movie", f.tmdbId ?? undefined);
              const code = episodeCode(f.season, f.episode, f.episodeEnd);
              return (
                <tr key={f.key} className={ROW}>
                  <td className="w-full max-w-0 px-3 py-2">
                    <div className="truncate">
                      {href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium transition-colors hover:text-primary"
                        >
                          {f.title}
                        </a>
                      ) : (
                        <span className="font-medium">{f.title}</span>
                      )}
                      {code ? (
                        <span className="ml-1.5 text-muted-foreground">
                          <span className="font-num tabular-nums">{code}</span>
                          {f.episodeTitle ? ` · ${f.episodeTitle}` : null}
                        </span>
                      ) : f.year ? (
                        <span className="ml-1.5 font-num text-muted-foreground">{f.year}</span>
                      ) : null}
                    </div>
                    <div
                      className="font-mono text-[11px] [overflow-wrap:anywhere] text-muted-foreground sm:truncate"
                      title={f.fileName}
                    >
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
              <tr className="border-t border-border/70">
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  No files match. Try a different search.
                </td>
              </tr>
            ) : null}
            {!res ? (
              <tr className="border-t border-border/70">
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {res && items.length < matched && !loading ? (
        <LoadMore shown={items.length} onMore={showMore} loading={loadingMore} />
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{res ? pageText(0, items.length, matched) : ""}</p>
    </section>
  );
}
