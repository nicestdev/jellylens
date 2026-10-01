"use client";

import { Fragment, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  MoreHorizontal,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { StatTile } from "@/components/stat-tile";
import { Poster } from "@/components/poster";
import { CornerBadge } from "@/components/poster-card";
import { apiFetch, tmdbUrl } from "@/lib/api-client";
import { formatNumber, relativeTime, seasonLabel } from "@/lib/format";
import type {
  CollectionsResponse,
  EpisodeState,
  IgnoredResponse,
  IgnoreEntry,
  IgnoreKind,
  ShowIgnore,
  ShowItem as ShowWithMissing,
  ShowsResponse,
  StatusResponse,
} from "@/lib/api-types";
import { useLoad } from "@/hooks/use-load";
import { cn } from "@/lib/utils";
import { CardSkeleton, TONES, type Tone } from "./shared";
import { CollectionList, IgnoredCollections } from "./collections";
import { cardHint, episodeRanges, lineText, missingView, summary, type CategoryKey, type Group, type Line } from "./logic";

// Owned tiles stay neutral gray so only the gaps (in the category's tone)
// carry color; upcoming is a faint outline — nothing to own yet.
const TILE_CLASS: Record<Exclude<EpisodeState["state"], "missing">, string> = {
  owned: "bg-muted text-muted-foreground",
  upcoming: "text-muted-foreground/50 ring-1 ring-inset ring-foreground/10",
};

function tileClass(state: EpisodeState["state"], tone: Tone): string {
  return state === "missing" ? cn("font-semibold ring-1 ring-inset", TONES[tone].tile) : TILE_CLASS[state];
}
const SEGMENT_LABEL: Record<EpisodeState["state"], string> = {
  owned: "owned",
  missing: "missing",
  upcoming: "not aired yet",
};

// Movies (collection parts) under the Movies tab; missing episodes (gaps,
// whole seasons, seasons still airing) and Mismatches under TV Shows, one
// card each: gaps you'll want to fill, whole seasons you may have skipped
// on purpose, and airing ones you may just not have caught up on.
type Library = "movies" | "shows";
const LIBRARIES: { key: Library; label: string }[] = [
  { key: "movies", label: "Movies" },
  { key: "shows", label: "TV Shows" },
];

type Category = {
  key: CategoryKey;
  library: Library;
  label: string;
  hint: string;
  empty: { title: string; hint: string }; // shown when the category has nothing
  tone: Tone;
  unit: string; // what the stat card counts
  groupUnit: string; // what it counts them in
};

const CATEGORIES: Category[] = [
  {
    key: "movies",
    library: "movies",
    unit: "movie",
    groupUnit: "collection",
    label: "Movies",
    hint: "Movies out on disc or digital from collections you own part of.",
    empty: { title: "No gaps", hint: "You have every available movie of the collections you've started." },
    tone: "destructive",
  },
  {
    key: "gaps",
    library: "shows",
    unit: "episode",
    groupUnit: "show",
    label: "Missing episodes",
    hint: "Gaps in seasons that have finished airing.",
    empty: { title: "No gaps", hint: "Every finished season you've started is complete." },
    tone: "destructive",
  },
  {
    key: "seasons",
    library: "shows",
    unit: "episode",
    groupUnit: "show",
    label: "Missing seasons",
    hint: "Fully aired seasons you own none of.",
    empty: { title: "No missing seasons", hint: "You have episodes from every season that has finished airing." },
    tone: "destructive",
  },
  {
    key: "airing",
    library: "shows",
    unit: "episode",
    groupUnit: "show",
    label: "Currently airing",
    hint: "Seasons still airing — often you're just not caught up yet.",
    empty: { title: "All caught up", hint: "Nothing missing from seasons that are still airing." },
    tone: "warning",
  },
  {
    key: "mismatch",
    library: "shows",
    unit: "issue",
    groupUnit: "show",
    label: "Mismatches",
    hint: "Files TMDB doesn't know about — often duplicates, bonus content or a wrong match.",
    empty: { title: "No mismatches", hint: "Everything you own matches TMDB." },
    tone: "info",
  },
];

// Compact form for the pill in front of each tile row ("S2", "SP").
function seasonShort(season: number): string {
  return season === 0 ? "SP" : `S${season}`;
}


// One numbered tile per episode, so the exact gaps are readable at a glance.
// Tiles fill the available width and wrap only when the row is full.
function EpisodeStrip({ line, states, tone }: { line: Line; states: EpisodeState[]; tone: Tone }) {
  return (
    <div
      role="img"
      aria-label={`${line.count} missing: ${episodeRanges(line.episodes)}`}
      className="flex min-w-0 flex-1 flex-wrap gap-1"
    >
      {states.map(({ n, state }) => (
        <span
          key={n}
          title={`E${n} · ${SEGMENT_LABEL[state]}`}
          className={cn("grid h-6 w-6 place-items-center rounded-md text-[11px] tabular-nums", tileClass(state, tone))}
        >
          {n}
        </span>
      ))}
    </div>
  );
}

function StripLegend({ tone, upcoming }: { tone: Tone; upcoming: boolean }) {
  const items: [string, EpisodeState["state"]][] = [
    ["Owned", "owned"],
    ["Missing", "missing"],
    ...(upcoming ? ([["Not aired yet", "upcoming"]] as [string, EpisodeState["state"]][]) : []),
  ];
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      {items.map(([label, state]) => (
        <span key={label} className="flex items-center gap-1.5 whitespace-nowrap">
          <span
            className={cn(
              "size-3.5 rounded-[4px]",
              tileClass(state, tone),
              // bg-muted alone vanishes at this size on a dark background.
              state === "owned" && "ring-1 ring-inset ring-foreground/10"
            )}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function ShowCard({
  group,
  kind,
  tone,
  onIgnore,
}: {
  group: Group;
  kind: IgnoreKind;
  tone: Tone;
  onIgnore: (entry: ShowIgnore) => void;
}) {
  const { item, lines } = group;
  const singleSeason = lines.length === 1;
  const airing = lines.filter((l) => l.airing);
  // Poster and name link to TMDB; without a TMDB id they're plain.
  const href = tmdbUrl("tv", item.ProviderIds?.Tmdb);
  const PosterLink = href ? "a" : "div";
  const NameLink = href ? "a" : "span";
  const link = href ? { href, target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <article className="flex min-w-0 gap-4 rounded-xl border bg-card p-4">
      <PosterLink {...link} tabIndex={href ? -1 : undefined} className="group relative shrink-0">
        <Poster
          itemId={item.Id}
          tag={item.ImageTags?.Primary}
          alt=""
          className="w-20 transition-shadow group-hover:ring-2 group-hover:ring-primary/60"
        />
        {/* The season lives on the poster, so the tiles get the full row.
            Several seasons: the poster counts them and each row gets a pill. */}
        <CornerBadge
          badge={
            singleSeason
              ? { label: seasonShort(lines[0].season), hint: seasonLabel(lines[0].season) }
              : { label: `${lines.length} seasons` }
          }
          className="top-1.5 right-1.5"
        />
      </PosterLink>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <NameLink
              {...link}
              title={item.Name}
              className={cn("block truncate font-medium", href && "transition-colors hover:text-primary")}
            >
              {item.Name}
            </NameLink>
            {/* Airing goes here rather than on the season rows, so it doesn't
                push their episode tiles out of line with the other rows. */}
            {item.ProductionYear || airing.length ? (
              <p className="text-xs text-muted-foreground">
                {[
                  item.ProductionYear,
                  airing.length ? (
                    <span key="airing" title="Still airing — you may just not be caught up yet" className="text-warning">
                      {singleSeason ? "Still airing" : `${airing.map((l) => seasonShort(l.season)).join(", ")} still airing`}
                    </span>
                  ) : null,
                ]
                  .filter(Boolean)
                  .map((part, i) => (
                    <Fragment key={i}>
                      {i > 0 ? " · " : null}
                      {part}
                    </Fragment>
                  ))}
              </p>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More options for ${item.Name}`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "-mt-1 -mr-1 text-muted-foreground" }))}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              {lines.map((line) => (
                <DropdownMenuItem
                  key={`ignore-${line.season}`}
                  onClick={() => onIgnore({ kind, seriesId: item.Id, season: line.season })}
                >
                  <EyeOff />
                  Ignore {seasonLabel(line.season).toLowerCase()}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onIgnore({ kind, seriesId: item.Id, season: null })}>
                <EyeOff />
                Ignore entire show
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <ul className="mt-3 divide-y divide-border/60">
          {lines.map((line) => {
            return (
              <li
                key={`${line.season}-${line.episodes}`}
                className="flex items-start gap-2 py-2 first:pt-0 last:pb-0"
              >
                {/* Outlined, so it reads as a label next to the filled episode tiles. */}
                {singleSeason ? null : (
                  <span
                    title={seasonLabel(line.season)}
                    className="grid h-6 min-w-8 shrink-0 place-items-center rounded-md px-1.5 text-[11px] font-semibold ring-1 ring-border ring-inset"
                  >
                    {seasonShort(line.season)}
                  </span>
                )}
                {line.episodeStates?.length ? (
                  <EpisodeStrip line={line} states={line.episodeStates} tone={line.airing ? "warning" : tone} />
                ) : (
                  <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{lineText(line)}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

function IgnoredList({
  entries,
  shows,
  onUnignore,
}: {
  entries: ShowIgnore[];
  shows: ShowWithMissing[];
  onUnignore: (entry: ShowIgnore) => void;
}) {
  const byId = new Map(shows.map((s) => [s.Id, s]));
  const name = (id: string) => byId.get(id)?.Name ?? "Unknown show";
  const sorted = [...entries].sort(
    (a, b) =>
      name(a.seriesId).localeCompare(name(b.seriesId)) ||
      a.kind.localeCompare(b.kind) ||
      (a.season ?? -1) - (b.season ?? -1)
  );

  if (!sorted.length) return <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored seasons and shows show up here." />;

  return (
    <ul className="divide-y rounded-xl border bg-card">
      {sorted.map((e) => {
        const show = byId.get(e.seriesId);
        return (
          <li key={`${e.kind}-${e.seriesId}-${e.season}`} className="flex items-center gap-3 px-4 py-2.5">
            <Poster
              itemId={e.seriesId}
              tag={show?.ImageTags?.Primary}
              alt=""
              className="w-8"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{name(e.seriesId)}</div>
              <div className="text-xs text-muted-foreground">
                {e.season === null ? "Entire show" : seasonLabel(e.season)} ·{" "}
                {e.kind === "missing" ? "Missing" : "Mismatch"}
              </div>
            </div>
            <Button variant="outline" onClick={() => onUnignore(e)}>
              Unignore
            </Button>
          </li>
        );
      })}
    </ul>
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
  const error = actionError || (page.error && `Failed to load: ${page.error}`);
  const [library, setLibrary] = useState<Library | null>(null);
  const [view, setView] = useState<CategoryKey | "ignored" | null>(null);

  async function updateIgnored(method: "POST" | "DELETE", entry: IgnoreEntry) {
    try {
      const res = await apiFetch<IgnoredResponse>("/api/ignored", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
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
    ignored
  );

  // Until the user picks a tab, land on the first library with anything
  // missing; in it, until they pick a card, on its first category with
  // anything in it. Switching tabs starts over at that category.
  const activeLibrary =
    library ?? LIBRARIES.find((l) => CATEGORIES.some((c) => c.library === l.key && counts[c.key].groups))?.key ?? "movies";
  const categories = CATEGORIES.filter((c) => c.library === activeLibrary);
  const activeView = view ?? categories.find((c) => counts[c.key].groups)?.key ?? categories[0].key;
  const activeCategory = categories.find((c) => c.key === activeView);
  // Missing episodes come as strips of tiles, with a legend.
  const strips = activeCategory !== undefined && activeCategory.key !== "movies" && activeCategory.key !== "mismatch";
  // The Ignored list is the tab's own.
  const tabIgnored = activeLibrary === "shows" ? showIgnored.length : collectionIgnored.length;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Missing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${summary(counts)} missing · checked ${relativeTime(page.data?.checkedAt ?? null)}`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Tabs
            value={activeLibrary}
            onValueChange={(v) => {
              setLibrary(v as Library);
              setView(null);
            }}
          >
            <TabsList>
              {LIBRARIES.map((l) => (
                <TabsTrigger key={l.key} value={l.key} className="px-3">
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {categories.map((c) => (
          <StatTile
            key={c.key}
            label={c.label}
            value={formatNumber(counts[c.key].count)}
            hint={cardHint(counts[c.key].count, counts[c.key].groups, c.unit, c.groupUnit)}
            muted={!counts[c.key].count}
            active={activeView === c.key}
            loading={loading}
            onClick={() => setView(c.key)}
          />
        ))}
      </div>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {activeCategory ? (
          <p className="min-w-0 text-sm text-muted-foreground">{activeCategory.hint}</p>
        ) : (
          <Button variant="ghost" className="-ml-2.5" onClick={() => setView(null)}>
            <ArrowLeft />
            Back
          </Button>
        )}
        {activeCategory ? (
          <div className="ml-auto flex w-full items-center justify-end gap-3 sm:w-auto">
            {/* Full width (its own line) on phones — whether it fit next to the
                hint depended on the hint's length, so it jumped between cards. */}
            {strips ? <StripLegend tone={activeCategory.tone} upcoming={activeCategory.key === "airing"} /> : null}
            {tabIgnored ? (
              <>
                {strips ? <span className="h-4 w-px bg-border" /> : null}
                <Button
                  variant="ghost"
                  className="-mr-2.5 shrink-0 text-muted-foreground"
                  onClick={() => setView("ignored")}
                >
                  <EyeOff />
                  Ignored
                  <span className="font-mono text-xs tabular-nums">{tabIgnored}</span>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className={cn("grid grid-cols-1 gap-3", activeLibrary === "shows" && "lg:grid-cols-2")}>
          {Array.from({ length: 3 }, (_, i) => (
            <CardSkeleton key={i} collection={activeLibrary === "movies"} />
          ))}
        </div>
      ) : !activeCategory ? (
        activeLibrary === "shows" ? (
          <IgnoredList entries={showIgnored} shows={shows} onUnignore={unignore} />
        ) : collectionIgnored.length ? (
          <IgnoredCollections entries={collectionIgnored} collections={collections} onUnignore={unignore} />
        ) : (
          <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored collections and movies show up here." />
        )
      ) : counts[activeCategory.key].groups === 0 ? (
        <EmptyState icon={CheckCircle2} title={activeCategory.empty.title} hint={activeCategory.empty.hint} />
      ) : activeCategory.key === "movies" ? (
        <CollectionList groups={collectionGroups} onIgnore={ignore} onReleasesChanged={() => void page.reload()} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {showGroups[activeCategory.key].map((group) => (
            <ShowCard
              key={group.item.Id}
              group={group}
              kind={activeCategory.key === "mismatch" ? "mismatch" : "missing"}
              tone={activeCategory.tone}
              onIgnore={ignore}
            />
          ))}
        </div>
      )}
    </main>
  );
}
