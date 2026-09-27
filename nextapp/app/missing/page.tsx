"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  EyeOff,
  GitCompareArrows,
  Layers,
  ListX,
  MoreHorizontal,
  Radio,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Poster } from "@/components/poster";
import { CornerBadge } from "@/components/poster-card";
import { apiFetch, relativeTime, type MediaItem, type SyncStatus } from "@/lib/api-client";
import { cn } from "@/lib/utils";

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
type IgnoreEntry = { kind: IgnoreKind; seriesId: string; season: number | null };

// One season line on a show card. extraSeason = a whole season TMDB
// doesn't list at all (mismatches only).
type Line = {
  season: number;
  episodes: string;
  count: number;
  total?: number;
  episodeStates?: EpisodeState[];
  wholeSeason?: boolean;
  extraSeason?: boolean;
};
type Group = { item: ShowWithMissing; lines: Line[] };

type Tone = "destructive" | "warning" | "info";
const TONES: Record<Tone, { badge: string; tile: string }> = {
  destructive: { badge: "bg-destructive/15 text-destructive", tile: "bg-destructive/15 text-destructive ring-destructive/40" },
  warning: { badge: "bg-warning/15 text-warning", tile: "bg-warning/15 text-warning ring-warning/40" },
  info: { badge: "bg-info/15 text-info", tile: "bg-info/15 text-info ring-info/40" },
};

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

type CategoryKey = "gaps" | "seasons" | "airing" | "mismatch";
type Category = {
  key: CategoryKey;
  label: string;
  hint: string;
  empty: { title: string; hint: string }; // shown when the category has nothing
  tone: Tone;
  kind: IgnoreKind;
  icon: LucideIcon;
  unit: string; // what the stat card counts
};

const CATEGORIES: Category[] = [
  {
    key: "gaps",
    icon: ListX,
    unit: "episode",
    label: "Missing episodes",
    hint: "Gaps in seasons that have finished airing.",
    empty: { title: "No gaps", hint: "Every finished season you've started is complete." },
    tone: "destructive",
    kind: "missing",
  },
  {
    key: "seasons",
    icon: Layers,
    unit: "episode",
    label: "Missing seasons",
    hint: "Fully aired seasons you own none of.",
    empty: { title: "No missing seasons", hint: "You have episodes from every season that has finished airing." },
    tone: "destructive",
    kind: "missing",
  },
  {
    key: "airing",
    icon: Radio,
    unit: "episode",
    label: "Currently airing",
    hint: "Seasons still airing — often you're just not caught up yet.",
    empty: { title: "All caught up", hint: "Nothing missing from seasons that are still airing." },
    tone: "warning",
    kind: "missing",
  },
  {
    key: "mismatch",
    icon: GitCompareArrows,
    unit: "issue",
    label: "Mismatches",
    hint: "Files TMDB doesn't know about — often duplicates, bonus content or a wrong match.",
    empty: { title: "No mismatches", hint: "Everything you own matches TMDB." },
    tone: "info",
    kind: "mismatch",
  },
];

function isIgnored(ignored: IgnoreEntry[], kind: IgnoreKind, seriesId: string, season: number): boolean {
  return ignored.some(
    (e) => e.kind === kind && e.seriesId === seriesId && (e.season === null || e.season === season)
  );
}

function linesFor(item: ShowWithMissing, key: CategoryKey): Line[] {
  if (key === "mismatch") {
    const m = item.Mismatches;
    if (!m) return [];
    return [
      ...m.extraSeasons.map((season) => ({ season, episodes: "", count: 1, extraSeason: true })),
      ...m.extraEpisodes.map((s) => ({ season: s.season, episodes: s.episodes, count: s.count })),
    ].sort((a, b) => a.season - b.season);
  }
  const predicate: (s: MissingSeason) => boolean =
    key === "airing" ? (s) => !s.ended : key === "seasons" ? (s) => s.ended && s.wholeSeason : (s) => s.ended && !s.wholeSeason;
  return (item.MissingEpisodes?.seasons ?? []).filter(predicate);
}

function seasonLabel(season: number): string {
  return season === 0 ? "Specials" : `Season ${season}`;
}

// Compact form for the pill in front of each tile row ("S2", "SP").
function seasonShort(season: number): string {
  return season === 0 ? "SP" : `S${season}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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

function StatCard({
  category,
  episodes,
  shows,
  active,
  loading,
  onClick,
}: {
  category: Category;
  episodes: number;
  shows: number;
  active: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const Icon = category.icon;
  const empty = !loading && episodes === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border bg-card p-4 text-left transition-colors outline-none hover:border-foreground/20 focus-visible:ring-3 focus-visible:ring-ring/50",
        active && "border-primary/60 ring-1 ring-primary/40 hover:border-primary/60"
      )}
    >
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            empty ? "bg-muted text-muted-foreground" : TONES[category.tone].badge
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="text-sm leading-tight font-medium">{category.label}</span>
      </div>
      {loading ? (
        <>
          <Skeleton className="mt-4 h-7 w-24" />
          <Skeleton className="mt-1.5 h-3 w-16" />
        </>
      ) : (
        <>
          <div className="mt-4 flex items-baseline gap-1.5">
            <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", empty && "text-muted-foreground")}>
              {episodes}
            </span>
            <span className="text-sm text-muted-foreground">{episodes === 1 ? category.unit : `${category.unit}s`}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{empty ? "Nothing to do" : `in ${plural(shows, "show")}`}</div>
        </>
      )}
    </button>
  );
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
  category,
  itemUrl,
  jellyfinItemUrl,
  onIgnore,
}: {
  group: Group;
  category: Category;
  itemUrl: (item: MediaItem) => string;
  jellyfinItemUrl: (item: MediaItem) => string;
  onIgnore: (entry: IgnoreEntry) => void;
}) {
  const { item, lines } = group;
  const singleSeason = lines.length === 1;
  return (
    <article className="flex min-w-0 gap-4 rounded-xl border bg-card p-4">
      <a href={itemUrl(item)} target="_blank" rel="noopener noreferrer" tabIndex={-1} className="group relative shrink-0">
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
      </a>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={itemUrl(item)}
              target="_blank"
              rel="noopener noreferrer"
              title={item.Name}
              className="block truncate font-medium transition-colors hover:text-primary"
            >
              {item.Name}
            </a>
            {item.ProductionYear ? <p className="text-xs text-muted-foreground">{item.ProductionYear}</p> : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`More options for ${item.Name}`}
              className={cn(buttonVariants({ variant: "ghost", size: "icon-sm", className: "-mt-1 -mr-1 text-muted-foreground" }))}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-auto">
              <DropdownMenuItem onClick={() => window.open(jellyfinItemUrl(item), "_blank", "noopener")}>
                Open in Jellyfin
              </DropdownMenuItem>
              {item.ProviderIds?.Tmdb ? (
                <DropdownMenuItem onClick={() => window.open(itemUrl(item), "_blank", "noopener")}>
                  Open on TMDB
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuSeparator />
              {lines.map((line) => (
                <DropdownMenuItem
                  key={`ignore-${line.season}`}
                  onClick={() => onIgnore({ kind: category.kind, seriesId: item.Id, season: line.season })}
                >
                  <EyeOff />
                  Ignore {seasonLabel(line.season).toLowerCase()}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onClick={() => onIgnore({ kind: category.kind, seriesId: item.Id, season: null })}>
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
                  <EpisodeStrip line={line} states={line.episodeStates} tone={category.tone} />
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
  entries: IgnoreEntry[];
  shows: ShowWithMissing[];
  onUnignore: (entry: IgnoreEntry) => void;
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

function CardSkeleton() {
  return (
    <div className="flex gap-4 rounded-xl border bg-card p-4">
      <Skeleton className="aspect-2/3 w-20" />
      <div className="flex-1 space-y-2 pt-1">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-5 w-full max-w-md" />
      </div>
    </div>
  );
}

export default function MissingPage() {
  const [shows, setShows] = useState<ShowWithMissing[]>([]);
  const [ignored, setIgnored] = useState<IgnoreEntry[]>([]);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [jellyfinUrl, setJellyfinUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [rechecking, setRechecking] = useState(false);
  const [view, setView] = useState<CategoryKey | "ignored" | null>(null);

  const load = useCallback(async () => {
    try {
      const [config, showsRes, ignoredRes, status] = await Promise.all([
        apiFetch<{ jellyfinPublicUrl: string }>("/api/config"),
        apiFetch<{ Items: ShowWithMissing[] }>("/api/shows"),
        apiFetch<{ Items: IgnoreEntry[] }>("/api/ignored"),
        apiFetch<SyncStatus>("/api/status"),
      ]);
      setJellyfinUrl(config.jellyfinPublicUrl);
      setShows([...(showsRes.Items ?? [])].sort((a, b) => a.Name.localeCompare(b.Name)));
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

  function jellyfinItemUrl(item: MediaItem): string {
    return `${jellyfinUrl}/web/index.html#!/details?id=${item.Id}&serverId=${item.ServerId ?? ""}`;
  }

  function itemUrl(item: MediaItem): string {
    const tmdbId = item.ProviderIds?.Tmdb;
    return tmdbId ? `https://www.themoviedb.org/tv/${tmdbId}` : jellyfinItemUrl(item);
  }

  const groupsByCategory = Object.fromEntries(
    CATEGORIES.map((c) => [
      c.key,
      shows
        .map((item) => ({
          item,
          lines: linesFor(item, c.key).filter((l) => !isIgnored(ignored, c.kind, item.Id, l.season)),
        }))
        .filter((g) => g.lines.length > 0),
    ])
  ) as Record<CategoryKey, Group[]>;

  const episodeCount = (groups: Group[]) => groups.reduce((sum, g) => sum + g.lines.reduce((s, l) => s + l.count, 0), 0);

  const missingGroups = [...groupsByCategory.gaps, ...groupsByCategory.seasons, ...groupsByCategory.airing];
  const totalMissing = episodeCount(missingGroups);
  const totalShows = new Set(missingGroups.map((g) => g.item.Id)).size;

  // Until the user picks a card, land on the first category with anything in it.
  const activeView = view ?? CATEGORIES.find((c) => groupsByCategory[c.key].length)?.key ?? "gaps";
  const activeCategory = CATEGORIES.find((c) => c.key === activeView);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Missing</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {loading
              ? "Loading…"
              : `${totalMissing ? `${plural(totalMissing, "episode")} missing across ${plural(totalShows, "show")}` : "Your library is complete"} · checked ${relativeTime(checkedAt)}`}
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

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CATEGORIES.map((c) => (
          <StatCard
            key={c.key}
            category={c}
            episodes={episodeCount(groupsByCategory[c.key])}
            shows={groupsByCategory[c.key].length}
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
                hint depended on the hint's length, so it jumped between tabs. */}
            {activeCategory.kind === "missing" ? (
              <StripLegend tone={activeCategory.tone} upcoming={activeCategory.key === "airing"} />
            ) : null}
            {ignored.length ? (
              <>
                {activeCategory.kind === "missing" ? <span className="h-4 w-px bg-border" /> : null}
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
      ) : activeCategory ? (
        groupsByCategory[activeCategory.key].length ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {groupsByCategory[activeCategory.key].map((group) => (
              <ShowCard
                key={group.item.Id}
                group={group}
                category={activeCategory}
                itemUrl={itemUrl}
                jellyfinItemUrl={jellyfinItemUrl}
                onIgnore={ignore}
              />
            ))}
          </div>
        ) : (
          <EmptyState icon={CheckCircle2} title={activeCategory.empty.title} hint={activeCategory.empty.hint} />
        )
      ) : (
        <IgnoredList entries={ignored} shows={shows} onUnignore={unignore} />
      )}
    </main>
  );
}
