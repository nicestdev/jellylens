"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  Film,
  GitCompareArrows,
  MoreHorizontal,
  RefreshCw,
  Tv,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { Poster } from "@/components/poster";
import { CornerBadge } from "@/components/poster-card";
import { apiFetch, relativeTime, tmdbUrl, type MediaItem, type SyncStatus } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { CardSkeleton, StatCard, TONES, plural, type Tone } from "./shared";
import {
  CollectionList,
  IgnoredCollections,
  missingParts,
  type CollectionIgnore,
  type MissingCollection,
} from "./collections";

type MissingSeason = {
  season: number;
  episodes: string;
  wholeSeason: boolean;
  ended: boolean;
  count: number;
  // Both absent until the next missing-recheck after upgrading.
  total?: number;
  episodeStates?: EpisodeState[];
};
type EpisodeState = { n: number; state: "owned" | "missing" | "upcoming" };
type ExtraSeason = { season: number; episodes: string; count: number };
type ShowWithMissing = MediaItem & {
  Status?: string;
  ImageTags?: { Primary?: string };
  MissingEpisodes: { count: number; seasons: MissingSeason[] } | null;
  Mismatches: { extraSeasons: number[]; extraEpisodes: ExtraSeason[] } | null;
};

type IgnoreKind = "missing" | "mismatch";
type ShowIgnore = { kind: IgnoreKind; seriesId: string; season: number | null };
type IgnoreEntry = ShowIgnore | CollectionIgnore;

// One season line on a show card. extraSeason = a whole season TMDB
// doesn't list at all (mismatches only). airing = the season is still
// airing, so the gaps may just mean you're not caught up yet.
type Line = {
  season: number;
  episodes: string;
  count: number;
  total?: number;
  episodeStates?: EpisodeState[];
  wholeSeason?: boolean;
  extraSeason?: boolean;
  airing?: boolean;
};
type Group = { item: ShowWithMissing; lines: Line[] };

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

// Shows (missing episodes — gaps, whole seasons and seasons still airing),
// Movies (collection parts) and Mismatches, one card each.
type CategoryKey = "shows" | "movies" | "mismatch";
type Category = {
  key: CategoryKey;
  label: string;
  hint: string;
  empty: { title: string; hint: string }; // shown when the category has nothing
  tone: Tone;
  icon: LucideIcon;
  unit: string; // what the stat card counts
  groupUnit: string; // what it counts them in
};

const CATEGORIES: Category[] = [
  {
    key: "shows",
    icon: Tv,
    unit: "episode",
    groupUnit: "show",
    label: "Shows",
    hint: "Episodes you don't have. Seasons still airing are marked — often you're just not caught up yet.",
    empty: { title: "No gaps", hint: "Every season you've started is complete." },
    tone: "destructive",
  },
  {
    key: "movies",
    icon: Film,
    unit: "movie",
    groupUnit: "collection",
    label: "Movies",
    hint: "Movies out on disc or digital from collections you own part of.",
    empty: { title: "No gaps", hint: "You have every available movie of the collections you've started." },
    tone: "destructive",
  },
  {
    key: "mismatch",
    icon: GitCompareArrows,
    unit: "issue",
    groupUnit: "show",
    label: "Mismatches",
    hint: "Files TMDB doesn't know about — often duplicates, bonus content or a wrong match.",
    empty: { title: "No mismatches", hint: "Everything you own matches TMDB." },
    tone: "info",
  },
];

function isIgnored(ignored: ShowIgnore[], kind: IgnoreKind, seriesId: string, season: number): boolean {
  return ignored.some(
    (e) => e.kind === kind && e.seriesId === seriesId && (e.season === null || e.season === season)
  );
}

function linesFor(item: ShowWithMissing, key: "shows" | "mismatch"): Line[] {
  if (key === "mismatch") {
    const m = item.Mismatches;
    if (!m) return [];
    return [
      ...m.extraSeasons.map((season) => ({ season, episodes: "", count: 1, extraSeason: true })),
      ...m.extraEpisodes.map((s) => ({ season: s.season, episodes: s.episodes, count: s.count })),
    ].sort((a, b) => a.season - b.season);
  }
  // Finished seasons first: those are the real gaps.
  return (item.MissingEpisodes?.seasons ?? [])
    .map((s) => ({ ...s, airing: !s.ended }))
    .sort((a, b) => Number(a.airing) - Number(b.airing) || a.season - b.season);
}

function seasonLabel(season: number): string {
  return season === 0 ? "Specials" : `Season ${season}`;
}

// Compact form for the pill in front of each tile row ("S2", "SP").
function seasonShort(season: number): string {
  return season === 0 ? "SP" : `S${season}`;
}

// "5-7, 9" -> "E5–7, E9"
function episodeRanges(episodes: string): string {
  return episodes
    .split(", ")
    .map((part) => `E${part.replace("-", "–")}`)
    .join(", ");
}

// Text fallback for lines without per-episode data: mismatches, and missing
// seasons computed before episodeStates existed.
function lineText(line: Line): string {
  if (line.extraSeason) return "Not on TMDB";
  if (line.wholeSeason) return "Entire season";
  return episodeRanges(line.episodes);
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

export default function MissingPage() {
  const [shows, setShows] = useState<ShowWithMissing[]>([]);
  const [collections, setCollections] = useState<MissingCollection[]>([]);
  const [ignored, setIgnored] = useState<IgnoreEntry[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [view, setView] = useState<CategoryKey | "ignored" | null>(null);

  const load = useCallback(async () => {
    try {
      const [showsRes, collectionsRes, ignoredRes, status] = await Promise.all([
        apiFetch<{ Items: ShowWithMissing[] }>("/api/shows"),
        apiFetch<{ Items: MissingCollection[] }>("/api/collections"),
        apiFetch<{ Items: IgnoreEntry[] }>("/api/ignored"),
        apiFetch<SyncStatus>("/api/status"),
      ]);
      setShows([...(showsRes.Items ?? [])].sort((a, b) => a.Name.localeCompare(b.Name)));
      setCollections(collectionsRes.Items ?? []);
      setIgnored(ignoredRes.Items ?? []);
      setCheckedAt(status.missing.syncedAt);
      setError("");
    } catch (e) {
      setError(`Failed to load: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function recheck() {
    setRechecking(true);
    try {
      await apiFetch("/api/recheck-missing", { method: "POST" });
      await load();
    } catch (e) {
      setError(`Recheck failed: ${(e as Error).message}`);
    } finally {
      setRechecking(false);
    }
  }

  async function updateIgnored(method: "POST" | "DELETE", entry: IgnoreEntry) {
    try {
      const res = await apiFetch<{ Items: IgnoreEntry[] }>("/api/ignored", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      setIgnored(res.Items);
      setError("");
    } catch (e) {
      setError(`Failed to update ignore list: ${(e as Error).message}`);
    }
  }

  const ignore = (entry: IgnoreEntry) => updateIgnored("POST", entry);
  const unignore = (entry: IgnoreEntry) => updateIgnored("DELETE", entry);

  const showIgnored = ignored.filter((e): e is ShowIgnore => e.kind !== "collection");
  const collectionIgnored = ignored.filter((e): e is CollectionIgnore => e.kind === "collection");

  const showGroups = (key: "shows" | "mismatch", kind: IgnoreKind): Group[] =>
    shows
      .map((item) => ({ item, lines: linesFor(item, key).filter((l) => !isIgnored(showIgnored, kind, item.Id, l.season)) }))
      .filter((g) => g.lines.length > 0);
  const missingShows = showGroups("shows", "missing");
  const mismatches = showGroups("mismatch", "mismatch");
  const collectionGroups = collections
    .map((collection) => ({ collection, parts: missingParts(collection, collectionIgnored) }))
    .filter((g) => g.parts.length > 0);

  const lineCount = (groups: Group[], airing?: boolean) =>
    groups.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + (airing === undefined || l.airing === airing ? l.count : 0), 0), 0);
  const counts: Record<CategoryKey, { count: number; groups: number }> = {
    shows: { count: lineCount(missingShows), groups: missingShows.length },
    movies: { count: collectionGroups.reduce((sum, g) => sum + g.parts.length, 0), groups: collectionGroups.length },
    mismatch: { count: lineCount(mismatches), groups: mismatches.length },
  };
  const airingCount = lineCount(missingShows, true);

  const summary =
    [
      counts.shows.count ? plural(counts.shows.count, "episode") : null,
      counts.movies.count ? plural(counts.movies.count, "movie") : null,
    ]
      .filter(Boolean)
      .join(" and ") || "Nothing";

  // Until the user picks a card, land on the first category with anything in it.
  const activeView = view ?? CATEGORIES.find((c) => counts[c.key].groups)?.key ?? "shows";
  const activeCategory = CATEGORIES.find((c) => c.key === activeView);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Missing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading ? "Loading…" : `${summary} missing · checked ${relativeTime(checkedAt)}`}
          </p>
        </div>
        <Button variant="outline" className="ml-auto" onClick={recheck} disabled={rechecking || loading}>
          <RefreshCw className={cn(rechecking && "animate-spin")} />
          {rechecking ? "Rechecking…" : "Recheck"}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-6">
          <AlertCircle />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {CATEGORIES.map((c) => (
          <StatCard
            key={c.key}
            label={c.label}
            icon={c.icon}
            tone={c.tone}
            unit={c.unit}
            groupUnit={c.groupUnit}
            count={counts[c.key].count}
            groups={counts[c.key].groups}
            detail={c.key === "shows" && airingCount ? `${airingCount} airing` : undefined}
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
            {activeCategory.key === "shows" ? <StripLegend tone={activeCategory.tone} upcoming={airingCount > 0} /> : null}
            {ignored.length ? (
              <>
                {activeCategory.key === "shows" ? <span className="h-4 w-px bg-border" /> : null}
                <Button
                  variant="ghost"
                  className="-mr-2.5 shrink-0 text-muted-foreground"
                  onClick={() => setView("ignored")}
                >
                  <EyeOff />
                  Ignored
                  <span className="font-mono text-xs tabular-nums">{ignored.length}</span>
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      ) : !activeCategory ? (
        <div className="space-y-6">
          {showIgnored.length ? (
            <section>
              <h2 className="mb-2 text-sm font-medium">Shows</h2>
              <IgnoredList entries={showIgnored} shows={shows} onUnignore={unignore} />
            </section>
          ) : null}
          {collectionIgnored.length ? (
            <section>
              <h2 className="mb-2 text-sm font-medium">Movies</h2>
              <IgnoredCollections entries={collectionIgnored} collections={collections} onUnignore={unignore} />
            </section>
          ) : null}
          {ignored.length ? null : <EmptyState icon={EyeOff} title="Nothing ignored" hint="Ignored shows and movies show up here." />}
        </div>
      ) : counts[activeCategory.key].groups === 0 ? (
        <EmptyState icon={CheckCircle2} title={activeCategory.empty.title} hint={activeCategory.empty.hint} />
      ) : activeCategory.key === "movies" ? (
        <CollectionList groups={collectionGroups} onIgnore={ignore} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(activeCategory.key === "shows" ? missingShows : mismatches).map((group) => (
            <ShowCard
              key={group.item.Id}
              group={group}
              kind={activeCategory.key === "shows" ? "missing" : "mismatch"}
              tone={activeCategory.tone}
              onIgnore={ignore}
            />
          ))}
        </div>
      )}
    </main>
  );
}
