"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, Tv } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { FilterChips, FilterMenu, byCount, countValues, toggled } from "@/components/filter-menu";
import { POSTER_GRID, PosterCard, PosterGridSkeleton } from "@/components/poster-card";
import { SortMenu, compareValues, type SortDir } from "@/components/sort-menu";
import { apiFetch, tmdbUrl, type MediaItem } from "@/lib/api-client";
import { languageName } from "@/lib/languages";

// Per-series audio language counts from /api/shows; null until the first
// Jellyfin sync after audio languages started being recorded.
type LanguageCoverage = {
  total: number;
  byLang: Record<string, number>;
  seasons: { season: number; total: number; byLang: Record<string, number> }[];
};

type Show = MediaItem & {
  ImageTags?: { Primary?: string };
  ChildCount?: number;
  RecursiveItemCount?: number;
  Status?: string;
  Genres?: string[];
  Languages?: LanguageCoverage | null;
};

const SORTS = [
  { key: "title", label: "Title", defaultDir: "asc" },
  { key: "year", label: "Year", defaultDir: "desc" },
  { key: "seasons", label: "Seasons", defaultDir: "desc" },
  { key: "episodes", label: "Episodes", defaultDir: "desc" },
] as const;
type SortKey = (typeof SORTS)[number]["key"];

function showSortValue(item: Show, key: SortKey): string | number {
  switch (key) {
    case "title": return item.Name.toLowerCase();
    case "year": return item.ProductionYear ?? 0;
    case "seasons": return item.ChildCount ?? 0;
    case "episodes": return item.RecursiveItemCount ?? 0;
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

// With a language filter active, a show that has the language in only some
// episodes gets a red badge ("EN 45/48") — red as in "missing", like on the
// Missing page; hovering it lists the seasons that fall short. Complete shows
// get no badge.
function languageBadge(cov: LanguageCoverage | null | undefined, selected: Set<string>) {
  if (!cov) return undefined;
  for (const lang of selected) {
    const have = cov.byLang[lang] ?? 0;
    if (have === 0 || have >= cov.total) continue;
    const gaps = cov.seasons
      .filter((s) => (s.byLang[lang] ?? 0) < s.total)
      .map((s) => `${s.season === 0 ? "Specials" : `Season ${s.season}`}: ${s.byLang[lang] ?? 0}/${s.total}`);
    return {
      label: `${lang} ${have}/${cov.total}`,
      tone: "destructive" as const,
      hint: [`${languageName(lang)} in ${have} of ${cov.total} episodes`, ...gaps].join("\n"),
    };
  }
  return undefined;
}

export default function ShowsPage() {
  const [shows, setShows] = useState<Show[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(() => new Set());
  const [genreFilter, setGenreFilter] = useState<Set<string>>(() => new Set());
  const [langFilter, setLangFilter] = useState<Set<string>>(() => new Set());
  const [sortKey, setSortKey] = useState<SortKey>("title");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const load = useCallback(async () => {
    try {
      const showsRes = await apiFetch<{ Items: Show[] }>("/api/shows");
      setShows(showsRes.Items ?? []);
      setError("");
    } catch (e) {
      setError(`Failed to load library: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Menu counts come from the whole library, so the menus don't shrink as
  // you filter. A show counts for a language if any episode has it.
  const q = query.trim().toLowerCase();
  const langsOf = (s: Show) => Object.keys(s.Languages?.byLang ?? {});
  const statusCounts = countValues(shows, (s) => (s.Status ? [s.Status] : []));
  const genreCounts = countValues(shows, (s) => s.Genres ?? []);
  const langCounts = countValues(shows, langsOf);
  const filtered = shows.filter((item) => {
    if (q && !item.Name.toLowerCase().includes(q)) return false;
    if (statusFilter.size && !statusFilter.has(item.Status ?? "")) return false;
    if (genreFilter.size && !(item.Genres ?? []).some((g) => genreFilter.has(g))) return false;
    if (langFilter.size && !langsOf(item).some((l) => langFilter.has(l))) return false;
    return true;
  });

  const rows = [...filtered].sort((a, b) => {
    const cmp = compareValues(showSortValue(a, sortKey), showSortValue(b, sortKey));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const narrowed = Boolean(q) || statusFilter.size > 0 || genreFilter.size > 0 || langFilter.size > 0;
  const totalEpisodes = shows.reduce((sum, s) => sum + (s.RecursiveItemCount ?? 0), 0);
  const chips = [
    ...[...statusFilter].map((s) => ({
      id: `status-${s}`,
      label: s,
      onRemove: () => setStatusFilter((prev) => toggled(prev, s)),
    })),
    ...[...genreFilter].map((g) => ({
      id: `genre-${g}`,
      label: g,
      onRemove: () => setGenreFilter((prev) => toggled(prev, g)),
    })),
    ...[...langFilter].map((l) => ({
      id: `lang-${l}`,
      label: languageName(l),
      onRemove: () => setLangFilter((prev) => toggled(prev, l)),
    })),
  ];

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">TV Shows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {loading
            ? "Loading…"
            : narrowed
              ? `${rows.length} of ${shows.length} shows`
              : `${shows.length} shows · ${totalEpisodes.toLocaleString("de-DE")} episodes`}
        </p>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <SearchInput value={query} onChange={setQuery} placeholder="Search shows…" className="w-full sm:w-64" />
        <FilterMenu
          facets={[
            {
              key: "status",
              label: "Status",
              values: byCount(statusCounts),
              counts: statusCounts,
              selected: statusFilter,
              onToggle: (v) => setStatusFilter((prev) => toggled(prev, v)),
            },
            {
              key: "genre",
              label: "Genre",
              values: byCount(genreCounts),
              counts: genreCounts,
              selected: genreFilter,
              onToggle: (v) => setGenreFilter((prev) => toggled(prev, v)),
            },
            {
              key: "lang",
              label: "Language",
              values: byCount(langCounts),
              counts: langCounts,
              selected: langFilter,
              onToggle: (v) => setLangFilter((prev) => toggled(prev, v)),
              format: languageName,
            },
          ]}
        />
        <div className="ml-auto">
          <SortMenu
            options={SORTS}
            sortKey={sortKey}
            sortDir={sortDir}
            onChange={(key, dir) => {
              setSortKey(key);
              setSortDir(dir);
            }}
          />
        </div>
      </div>

      <FilterChips
        chips={chips}
        onClear={() => {
          setStatusFilter(new Set());
          setGenreFilter(new Set());
          setLangFilter(new Set());
        }}
      />

      <div className="mt-6">
        {loading ? (
          <PosterGridSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState icon={Tv} title="No shows found" hint="Try a different search or remove a filter." />
        ) : (
          <div className={POSTER_GRID}>
            {rows.map((item) => (
              <PosterCard
                key={item.Id}
                href={tmdbUrl("tv", item.ProviderIds?.Tmdb)}
                itemId={item.Id}
                imageTag={item.ImageTags?.Primary}
                title={item.Name}
                // Year plus seasons; episodes instead while sorting by them —
                // all three don't fit on a tile.
                meta={[
                  item.ProductionYear,
                  sortKey === "episodes"
                    ? item.RecursiveItemCount
                      ? plural(item.RecursiveItemCount, "episode")
                      : null
                    : item.ChildCount
                      ? plural(item.ChildCount, "season")
                      : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                // Ended is the norm and gets no badge.
                badge={item.Status === "Continuing" ? { label: "Continuing" } : undefined}
                filterBadge={languageBadge(item.Languages, langFilter)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
