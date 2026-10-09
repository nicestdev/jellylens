"use client";

import { useState } from "react";
import { AlertCircle, CheckCircle2, EyeOff, SearchX } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SearchInput } from "@/components/search-input";
import { Segmented } from "@/components/segmented";
import { SectionTitle } from "@/components/section-title";
import { PosterGridSkeleton } from "@/components/poster-card";
import { apiFetch, jsonRequest } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";
import { matchesWords } from "@/lib/text";
import { LIBRARIES, type Library } from "@/lib/libraries";
import type {
  CollectionsResponse,
  IgnoredResponse,
  IgnoreEntry,
  ShowIgnore,
  ShowItem as ShowWithMissing,
  ShowsResponse,
  StatusResponse,
} from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { cn } from "@/lib/utils";
import { UnignoreGrid } from "./unignore-table";
import { CollectionList, IgnoredCollections } from "./collections";
import { ShowList } from "./show-table";
import { missingView, summary, type CategoryKey, type ShowCategory } from "./logic";

// Movies (collection parts) under the Movies tab; missing episodes (gaps,
// whole seasons, seasons still airing) and Mismatches under TV Shows, one
// card each: gaps you'll want to fill, whole seasons you may have skipped
// on purpose, and airing ones you may just not have caught up on.
const LIBRARY_KEYS = LIBRARIES.map((l) => l.key);

type Category = {
  key: CategoryKey;
  library: Library;
  label: string;
  hint: string;
  empty: { title: string; hint: string }; // shown when the category has nothing
};

const CATEGORIES: Category[] = [
  {
    key: "movies",
    library: "movies",
    label: "Collections",
    hint: "Movies out on disc or digital from collections you own part of.",
    empty: { title: "No gaps", hint: "You have every available movie of the collections you've started." },
  },
  {
    key: "gaps",
    library: "shows",
    label: "Missing episodes",
    hint: "Gaps in seasons that have finished airing.",
    empty: { title: "No gaps", hint: "Every finished season you've started is complete." },
  },
  {
    key: "seasons",
    library: "shows",
    label: "Missing seasons",
    hint: "Fully aired seasons you own none of.",
    empty: { title: "No missing seasons", hint: "You have episodes from every season that has finished airing." },
  },
  {
    key: "airing",
    library: "shows",
    label: "Currently airing",
    hint: "Seasons still airing — often you're just not caught up yet.",
    empty: { title: "All caught up", hint: "Nothing missing from seasons that are still airing." },
  },
  {
    key: "mismatch",
    library: "shows",
    label: "Mismatches",
    hint: "Files TMDB doesn't know about — often duplicates, bonus content or a wrong match.",
    empty: { title: "No mismatches", hint: "Everything you own matches TMDB." },
  },
];
// What a library shows: what's missing, or its Ignored list.
const VIEWS = ["missing", "ignored"] as const;

// The TV Shows tab's Ignored list: a season, or a whole show, of either
// kind (missing or mismatch).
function IgnoredList({
  entries,
  shows,
  query,
  onUnignore,
}: {
  entries: ShowIgnore[];
  shows: ShowWithMissing[];
  query: string; // narrows it by show name
  onUnignore: (entry: ShowIgnore) => void;
}) {
  const byId = new Map(shows.map((s) => [s.Id, s]));
  const name = (id: string) => byId.get(id)?.Name ?? "Unknown show";
  const sorted = [...entries].sort(
    (a, b) =>
      name(a.seriesId).localeCompare(name(b.seriesId)) ||
      a.kind.localeCompare(b.kind) ||
      (a.season ?? -1) - (b.season ?? -1),
  );
  if (!sorted.length)
    return <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored seasons and shows show up here." />;
  const matches = matchesWords(query);
  const shown = sorted.filter((e) => matches(name(e.seriesId)));
  if (!shown.length)
    return <EmptyState icon={SearchX} title="Nothing found" hint={`No ignored show matches “${query.trim()}”.`} />;
  return (
    <UnignoreGrid
      tiles={shown.map((e) => {
        const show = byId.get(e.seriesId);
        return {
          key: `${e.kind}-${e.seriesId}-${e.season}`,
          title: name(e.seriesId),
          // Missing is the norm; a mismatch says so after the year.
          meta:
            [show?.ProductionYear, e.kind === "mismatch" ? "Mismatch" : null].filter(Boolean).join(" · ") || undefined,
          itemId: show?.Id,
          imageTag: show?.ImageTags?.Primary,
          badge: e.season === null ? undefined : { label: `S${e.season}` },
          onUnignore: () => onUnignore(e),
        };
      })}
    />
  );
}

async function loadMissing() {
  const [showsRes, collectionsRes, ignoredRes, status] = await Promise.all([
    apiFetch<ShowsResponse>("/api/shows"),
    apiFetch<CollectionsResponse>("/api/collections"),
    apiFetch<IgnoredResponse>("/api/ignored"),
    apiFetch<StatusResponse>("/api/status"),
  ]);
  return {
    shows: [...showsRes.Items].sort((a, b) => a.Name.localeCompare(b.Name)),
    collections: collectionsRes.Items,
    ignored: ignoredRes.Items,
    checkedAt: status.missing.syncedAt,
  };
}

export default function MissingPage() {
  const page = useLoad(loadMissing);
  const shows = page.data?.shows ?? [];
  const collections = page.data?.collections ?? [];
  const ignored = page.data?.ignored ?? [];
  const loading = page.loading;
  // Errors of what the user just did; the load's own error shows otherwise.
  const [actionError, setActionError] = useState("");
  const [query, setQuery] = useState("");
  const error = actionError || (page.error && `Failed to load: ${page.error}`);
  // The library and, per library, whether its Ignored list was open, as
  // last picked in this browser.
  const [library, setLibrary] = useStoredChoice("jellylens.missing.library", LIBRARY_KEYS, null);

  async function updateIgnored(method: "POST" | "DELETE", entry: IgnoreEntry) {
    try {
      const res = await apiFetch<IgnoredResponse>("/api/ignored", jsonRequest(method, entry));
      page.setData((data) => data && { ...data, ignored: res.Items });
      setActionError("");
    } catch (e) {
      setActionError(`Failed to update ignore list: ${(e as Error).message}`);
    }
  }

  const ignore = (entry: IgnoreEntry) => updateIgnored("POST", entry);
  const unignore = (entry: IgnoreEntry) => updateIgnored("DELETE", entry);

  const { showIgnored, collectionIgnored, showGroups, collectionGroups, counts } = missingView(
    shows,
    collections,
    ignored,
  );

  // Until the user picks one, land on the first library with anything
  // missing.
  const activeLibrary =
    library ??
    LIBRARIES.find((l) => CATEGORIES.some((c) => c.library === l.key && counts[c.key].groups))?.key ??
    "movies";
  const categories = CATEGORIES.filter((c) => c.library === activeLibrary);
  const matches = matchesWords(query);
  // The collections' search: a collection matches by its name or one of
  // its missing movies'.
  const shownCollections = collectionGroups.filter(
    (g) => matches(g.collection.name) || g.parts.some((p) => matches(p.title)),
  );
  // The shows' categories with anything in them (after the search, by
  // name), a section each.
  const sections = CATEGORIES.filter((c) => c.library === "shows" && c.key !== "movies").flatMap((c) => {
    const groups = showGroups[c.key as ShowCategory].filter((g) => matches(g.item.Name));
    return groups.length ? [{ category: c, groups }] : [];
  });
  // The library's Ignored list, behind a toggle; remembered per library,
  // and given up once nothing is ignored anymore.
  const ignoredCount = activeLibrary === "shows" ? showIgnored.length : collectionIgnored.length;
  const [view, setView] = useStoredChoice(`jellylens.missing.${activeLibrary}`, VIEWS, null);
  const showIgnoredList = view === "ignored" && ignoredCount > 0;
  const nothingMissing = categories.every((c) => counts[c.key].groups === 0);

  return (
    <main className="w-full max-w-[1440px] px-4 py-5 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Missing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${summary(counts)} missing · checked ${relativeTime(page.data?.checkedAt ?? null)}`}
          </p>
        </div>
        <Segmented
          label="Library"
          segments={LIBRARIES}
          value={activeLibrary}
          onChange={setLibrary}
          className="w-full sm:w-auto"
        />
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* The same toolbar as Movies' and TV Shows': search, and at the
          right the Ignored toggle. */}
      <div className="mt-6 mb-6 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={
            showIgnoredList ? "Search ignored…" : activeLibrary === "movies" ? "Search movies…" : "Search shows…"
          }
          className="w-full sm:w-64"
        />
        <div className="ml-auto flex items-center gap-4">
          {ignoredCount ? (
            <button
              type="button"
              aria-pressed={showIgnoredList}
              onClick={() => setView(showIgnoredList ? "missing" : "ignored")}
              className={cn(
                "flex items-center gap-1.5 text-[13px] whitespace-nowrap transition-colors",
                showIgnoredList ? "text-primary hover:text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <EyeOff className="size-3.5" />
              {showIgnoredList ? "Back to missing" : "Ignored"}
              {showIgnoredList ? null : <span className="font-num text-[11px] tabular-nums">{ignoredCount}</span>}
            </button>
          ) : null}
        </div>
      </div>

      {loading ? (
        <PosterGridSkeleton />
      ) : showIgnoredList ? (
        activeLibrary === "shows" ? (
          <IgnoredList entries={showIgnored} shows={shows} query={query} onUnignore={unignore} />
        ) : (
          <IgnoredCollections
            entries={collectionIgnored}
            collections={collections}
            query={query}
            onUnignore={unignore}
          />
        )
      ) : nothingMissing ? (
        <EmptyState icon={CheckCircle2} title={categories[0].empty.title} hint={categories[0].empty.hint} />
      ) : activeLibrary === "movies" ? (
        shownCollections.length ? (
          <CollectionList groups={shownCollections} onIgnore={ignore} onReleasesChanged={() => void page.reload()} />
        ) : (
          <EmptyState
            icon={SearchX}
            title="Nothing found"
            hint={`No collection or missing movie matches “${query.trim()}”.`}
          />
        )
      ) : sections.length ? (
        <div className="flex flex-col gap-3">
          {sections.map(({ category: c, groups }) => (
            // Framed like a collection on the Movies side, the heading inside.
            <section key={c.key} className="rounded-lg border bg-card p-3">
              <SectionTitle count={counts[c.key].count} hint={c.hint}>
                {c.label}
              </SectionTitle>
              <ShowList groups={groups} kind={c.key === "mismatch" ? "mismatch" : "missing"} onIgnore={ignore} />
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon={SearchX} title="Nothing found" hint={`No show matches “${query.trim()}”.`} />
      )}
    </main>
  );
}
