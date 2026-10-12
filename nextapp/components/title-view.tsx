"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { Footer } from "@/components/footer";
import { Poster } from "@/components/poster";
import { FacetMenu, FilterChips, type Facet } from "@/components/filter-menu";
import { PageTools } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { MatchMenu, ReleaseTable, useMirrorCheck } from "@/components/title-releases";
import { PosterWish, type Result } from "@/components/request-tiles";
import { Skeleton } from "@/components/ui/skeleton";
import { RELEASES_CHANGED, apiFetch, tmdbImage, tmdbUrl, jsonRequest } from "@/lib/api-client";
import type { MatchInfo, ReleaseDetail, WcxRelease, WcxReleasesResponse, WcxSearchResponse } from "@/lib/api-types";
import { plural } from "@/lib/format";
import { matchNote } from "@/lib/release-labels";
import { titlePath } from "@/lib/title-path";
import { toast } from "@/lib/toast";
import {
  FACET_LABELS,
  facetValues,
  formatFacet,
  keepRow,
  ghostRows,
  libraryNote,
  allRowsOf,
  combineRows,
  noRowFilters,
  RELEASE_SORTS,
  seasonGroups,
  sortRows,
  toggleFilter,
  xrelRow,
  type ReleaseSortKey,
  type RowFacetKey,
  RESOLUTIONS,
} from "@/lib/title-rows";
import { SortMenu } from "@/components/sort-menu";
import { type SortDir } from "@/lib/facets";
import { Dot, Dots } from "@/components/dot";

// The menus after Quality: a show's seasons.
const FACET_KEYS: RowFacetKey[] = ["season"];
// The Quality menu's picks, several at once, none to start with (all);
// ones a title has none of don't count, and with none left it shows all.
type Quality = (typeof RESOLUTIONS)[number];

const KIND = { movie: "Movie", tv: "Show" } as const;

// A title's page (app/title/[kind]/[id]): poster, name and links on top,
// then every release the favorite groups put out on xREL and what WCX has
// to download, as tables. Discover, the Wishlist and the Dashboard
// open it over themselves (overlay, app/@modal), so going back finds
// them as they were; a link opened on its own is the plain page.
export function TitleView({ tileKey, overlay = false }: { tileKey: string; overlay?: boolean }) {
  const router = useRouter();
  // Tagged with the key they belong to, so another title never shows the
  // last one's list (or error) for a moment.
  const [detail, setDetail] = useState<{ key: string; value: ReleaseDetail } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  // A show's seasons opened or folded by a click on their heading (per
  // tile, as "tv:1:1-1"), kept that way however the filters narrow the
  // list; one not clicked is open when it's the first shown. While
  // searching every season with a match is open.
  const [folds, setFolds] = useState<Map<string, boolean>>(() => new Map());
  const [wcx, setWcx] = useState<{ tmdbId: string; url: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<ReleaseDetail>(`/api/releases/${encodeURIComponent(tileKey)}`)
      .then((res) => !cancelled && setDetail({ key: tileKey, value: res }))
      .catch((e) => !cancelled && setFailed({ key: tileKey, message: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [tileKey]);

  const current = detail?.key === tileKey ? detail.value : null;
  const error = failed?.key === tileKey ? failed.message : "";
  const head = current?.head ?? null;
  const tmdbId = head?.tmdbId && head.mediaType ? `${head.mediaType}:${head.tmdbId}` : null;

  useEffect(() => {
    if (!tmdbId) return;
    let cancelled = false;
    apiFetch<WcxSearchResponse>(`/api/wcx-search?tmdbId=${encodeURIComponent(tmdbId)}`)
      .then((res) => !cancelled && setWcx({ tmdbId, url: res.url }))
      .catch(() => !cancelled && setWcx({ tmdbId, url: null }));
    return () => {
      cancelled = true;
    };
  }, [tmdbId]);
  const wcxUrl = tmdbId && wcx?.tmdbId === tmdbId ? wcx.url : null;

  // What the WCX page has, once it's known there is one.
  const [wcxList, setWcxList] = useState<{ tmdbId: string; releases: WcxRelease[]; error: string } | null>(null);
  useEffect(() => {
    if (!tmdbId || !wcxUrl) return;
    let cancelled = false;
    apiFetch<WcxReleasesResponse>(`/api/wcx-releases?tmdbId=${encodeURIComponent(tmdbId)}`)
      .then((res) => !cancelled && setWcxList({ tmdbId, releases: res.releases, error: "" }))
      .catch((e) => !cancelled && setWcxList({ tmdbId, releases: [], error: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [tmdbId, wcxUrl]);
  const wcxReleases = wcxUrl && wcxList?.tmdbId === tmdbId ? wcxList : null;
  const checkMirrors = useMirrorCheck(tmdbId);

  // One search and filter over both tables.
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(noRowFilters);
  const [sortKey, setSortKey] = useState<ReleaseSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Next to the others, nothing picked on opening a title (not remembered).
  const [quality, setQuality] = useState<Quality[]>([]);
  // An overlay takes the focus (its Back) and gives it back to the tile it
  // was opened from once it closes.
  useEffect(() => {
    if (!overlay) return;
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus();
  }, [overlay]);

  // Opened over a list: Escape goes back to it, and the list underneath
  // doesn't scroll along.
  useEffect(() => {
    if (!overlay) return;
    // Not while Escape closes a menu or clears the search.
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.key !== "Escape" || target?.closest("input, [role=menu], [role=listbox]")) return;
      router.back();
    };
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [overlay, router]);

  function back() {
    if (overlay || window.history.length > 1) router.back();
    else router.push("/discover");
  }

  // One decision at a time (each answers with the whole tile, so two at
  // once could land in the wrong order); its answer only counts while this
  // title is still the one shown.
  const deciding = useRef(false);
  const showing = useRef<string | null>(tileKey);
  useEffect(() => {
    showing.current = tileKey;
    return () => {
      showing.current = null;
    };
  }, [tileKey]);

  async function decide(titleKey: string, verdict: MatchInfo["verdict"]) {
    if (!current || deciding.current) return;
    deciding.current = true;
    const asked = tileKey;
    setSaving(titleKey);
    try {
      const res = await apiFetch<ReleaseDetail>(
        `/api/releases/${encodeURIComponent(current.key)}`,
        jsonRequest("POST", { titleKey, verdict }),
      );
      window.dispatchEvent(new Event(RELEASES_CHANGED));
      // Closed or moved on to another title meanwhile.
      if (showing.current !== asked) return;
      // The title may be another tile now: follow it there.
      if (res.key !== tileKey) {
        setDetail({ key: res.key, value: res });
        router.replace(titlePath(res.key));
      } else {
        setDetail({ key: tileKey, value: res });
      }
    } catch (e) {
      // The list is still right; only the decision didn't stick.
      toast("Couldn't change the match", { description: (e as Error).message, tone: "error" });
    } finally {
      deciding.current = false;
      setSaving(null);
    }
  }

  const titles = current?.titles ?? [];
  const single = titles.length === 1 ? titles[0] : null;

  const xrel = titles.map((t) => ({ ...t, rows: t.items.map(xrelRow) }));
  const allRows = allRowsOf(titles, wcxReleases?.releases ?? []);
  const have = new Set(facetValues("resolution", allRows));
  const qualities = RESOLUTIONS.filter((q) => have.has(q));
  const pickedQualities = quality.filter((q) => have.has(q));
  const keep = keepRow(query, { ...filters, resolution: new Set(pickedQualities) });
  const xrelLinks = new Map(titles.flatMap((t) => t.items.map((r) => [r.id, r.link] as const)));
  // xREL's and WCX's as one list, each row tagged with where it's listed
  // and with the mirror buttons of every WCX copy (two a line on a phone).
  const combined = combineRows(
    xrel.flatMap((t) => t.rows),
    wcxReleases?.releases ?? [],
  );
  const shown = sortRows(combined.filter(keep), sortKey, sortDir);
  // A show's releases as a table per season; a movie's (or a show whose
  // names say no season) as one.
  const seasons = head?.mediaType !== "movie" && shown.some((r) => r.seasons) ? seasonGroups(shown) : null;
  // A season table's aired and known episodes (TMDB's), for its Episodes
  // column; none for Other.
  const airedIn = (key: string) => {
    const season = /^(\d+)-\1$/.exec(key)?.[1];
    return season ? (head?.aired?.[Number(season)] ?? null) : null;
  };
  // A season heading's count: its releases, then its aired episodes ("8 of 10 aired" while it runs).
  const countOf = (key: string, releases: number) => {
    const a = airedIn(key);
    const aired = a && (a.total > a.aired ? `${a.aired} of ${a.total} aired` : `${a.aired} aired`);
    return [plural(releases, "release"), aired];
  };
  // The library's files for a table (its gray rows first): a season's ("2-2", a pack's "1-3")
  // episodes, a movie's all; none for the releases without a season.
  const copiesIn = (key: string) => {
    const range = /^(\d+)-(\d+)$/.exec(key);
    if (!range) return key === "all" ? (head?.copies ?? []) : [];
    const [from, to] = [Number(range[1]), Number(range[2])];
    return (head?.copies ?? []).filter((c) => c.season !== null && c.season >= from && c.season <= to);
  };
  const facets: Facet[] = FACET_KEYS.map((key) => ({
    key,
    label: FACET_LABELS[key],
    values: facetValues(key, allRows).length > 1 || filters[key].size ? facetValues(key, allRows) : [],
    selected: filters[key],
    onToggle: (v: string) => setFilters((f) => toggleFilter(f, key, v)),
    format: (v: string) => formatFacet(key, v),
  }));
  // The picked qualities first, then the other menus' picks.
  const chips = [
    ...(qualities.length > 1 ? pickedQualities : []).map((q) => ({
      id: `quality-${q}`,
      label: formatFacet("resolution", q),
      onRemove: () => setQuality((picked) => picked.filter((v) => v !== q)),
    })),
    ...FACET_KEYS.flatMap((key) =>
      [...filters[key]].map((v) => ({
        id: `${key}-${v}`,
        label: formatFacet(key, v),
        onRemove: () => setFilters((f) => toggleFilter(f, key, v)),
      })),
    ),
  ];
  const noMatch = (
    <p className="text-sm text-muted-foreground">No releases match. Try a different search or remove a filter.</p>
  );
  const note = single
    ? matchNote(single.match)
    : titles.length > 1
      ? `Grouped from ${titles.length} xREL titles, each matched on its own.`
      : null;
  const poster = { imageSrc: tmdbImage(head?.library?.posterPath ?? head?.posterPath) };
  // What the wishlist button puts on it: the title's TMDB entry.
  const wish: Result | null =
    head?.tmdbId && head.mediaType
      ? {
          mediaType: head.mediaType,
          tmdbId: head.tmdbId,
          title: head.title,
          year: head.year ?? null,
          posterPath: head.posterPath ?? null,
          library: null,
          availability: null,
        }
      : null;
  const tmdb = head?.tmdbId && head.mediaType ? tmdbUrl(head.mediaType, head.tmdbId) : undefined;
  const xrelLink =
    head?.tmdbId && head.mediaType
      ? "/api/xrel-link?" + new URLSearchParams({ tmdbId: `${head.mediaType}:${head.tmdbId}`, title: head.title })
      : undefined;
  const links = [
    tmdb ? { label: "TMDB", href: tmdb } : null,
    xrelLink ? { label: "xREL", href: xrelLink } : null,
    wcxUrl ? { label: "WCX", href: wcxUrl } : null,
  ].filter((l): l is { label: string; href: string } => l !== null);

  const page = (
    <main className="w-full max-w-[90rem] px-4 py-5 sm:px-6">
      <button
        type="button"
        onClick={back}
        autoFocus={overlay}
        className="-ml-1 flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>
      {/* Headed like the nav's pages (below md in the phone bar like
          theirs); the title's name is under it. */}
      <h1 className="mt-3 text-3xl font-semibold max-md:sr-only">Releases</h1>

      {/* On a phone the name and buttons go beside the poster. */}
      <header className="mt-4 flex items-start gap-4 sm:flex-wrap sm:gap-7 md:mt-6">
        {head ? (
          // The poster's mark, as on a tile: in the library, or the
          // wishlist's heart.
          <div className="group/card relative w-24 shrink-0 sm:w-36">
            <Poster {...poster} alt="" className="w-full rounded-lg ring-white/6" />
            {wish ? <PosterWish item={wish} owned={Boolean(head.library)} /> : null}
          </div>
        ) : (
          <Skeleton className="aspect-2/3 w-24 shrink-0 rounded-lg sm:w-36" />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-[1_1_26rem] sm:gap-4">
          {head ? (
            <>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <h2 className="min-w-0 text-xl font-semibold text-balance sm:text-2xl">{head.title}</h2>
                  {single ? (
                    <MatchMenu
                      label={head.title}
                      match={single.match}
                      saving={saving === single.titleKey}
                      onPick={(v) => decide(single.titleKey, v)}
                    />
                  ) : null}
                </div>
                {/* The links after the rest, on a phone on a line of their own. */}
                <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm text-sub-foreground">
                  {[
                    head.year ? <span key="y">{head.year}</span> : null,
                    head.mediaType ? <span key="k">{KIND[head.mediaType]}</span> : null,
                    combined.length ? <span key="r">{plural(combined.length, "release")}</span> : null,
                  ]
                    .filter(Boolean)
                    .flatMap((el, i) => (i ? [<Dot key={`s${i}`} />, el] : [el]))}
                  {links.length ? (
                    <>
                      <Dot className="max-sm:hidden" />
                      <span className="flex items-baseline gap-x-1.5 max-sm:basis-full">
                        {links.flatMap((l, i) => [
                          i ? <Dot key={`s${i}`} /> : null,
                          <a
                            key={l.label}
                            href={l.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 self-center transition-colors hover:text-bright"
                          >
                            {l.label}
                            <ArrowUpRight className="size-3.5" />
                          </a>,
                        ])}
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
              {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
            </>
          ) : error ? null : current ? (
            <h2 className="text-2xl font-semibold">Not found</h2>
          ) : (
            <>
              <Skeleton className="h-8 w-2/3 max-w-96" />
              <Skeleton className="mt-2 h-4 w-40" />
            </>
          )}
        </div>
      </header>

      {error ? (
        <p className="mt-6 text-sm text-destructive">Failed to load releases: {error}</p>
      ) : !current ? (
        <div className="mt-6 flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <PageTools active={!!query || chips.length > 0}>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <SearchInput value={query} onChange={setQuery} placeholder="Search releases" size="lg" />
              {qualities.length > 1 ? (
                <FacetMenu
                  facet={{
                    key: "quality",
                    label: "Quality",
                    values: qualities,
                    selected: new Set(pickedQualities),
                    // From the latest picks: Clear calls it once for each.
                    onToggle: (q) =>
                      setQuality((picked) =>
                        picked.includes(q as Quality) ? picked.filter((v) => v !== q) : [...picked, q as Quality],
                      ),
                    format: (q) => formatFacet("resolution", q),
                  }}
                />
              ) : null}
              {facets.map((f) => (
                <FacetMenu key={f.key} facet={f} />
              ))}
              <div className="ml-auto">
                <SortMenu
                  options={RELEASE_SORTS}
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
                setFilters(noRowFilters());
                setQuality([]);
              }}
            />
          </PageTools>

          {/* One table, right under the toolbar (how many there are is
              in the line under the title). */}
          <section aria-label="Releases" className="mt-4">
            {wcxReleases?.error ? (
              <p className="mb-3 text-xs text-destructive">Couldn&apos;t load WCX: {wcxReleases.error}</p>
            ) : null}
            {/* Several xREL titles (one movie listed twice): each with its
                name, how it was matched and its ⋯ menu, since usually only
                one of them is matched wrong. */}
            {titles.length > 1 ? (
              <div className="mb-3 flex flex-col gap-1">
                {xrel.map((t) => (
                  <div key={t.titleKey} className="flex items-center gap-2">
                    <p className="min-w-0 flex-1 text-sm">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        <Dot /> <Dots parts={[plural(t.rows.length, "release"), matchNote(t.match)]} spaced />
                      </span>
                    </p>
                    <MatchMenu
                      label={t.label}
                      match={t.match}
                      saving={saving === t.titleKey}
                      onPick={(v) => decide(t.titleKey, v)}
                    />
                  </div>
                ))}
              </div>
            ) : null}
            {!combined.length ? (
              <p className="text-sm text-muted-foreground">
                None of your favorite groups has released this{wcxUrl ? ", and WCX has nothing" : ""}.
              </p>
            ) : !shown.length ? (
              noMatch
            ) : (
              <div className="flex flex-col gap-3">
                {(
                  seasons ?? [{ key: "all", label: head?.mediaType === "movie" ? "Movies" : "Releases", rows: shown }]
                ).map((s, i) => (
                  <ReleaseTable
                    key={s.key}
                    title={s.label}
                    rows={[
                      ...ghostRows(copiesIn(s.key), s.rows, head?.mediaType === "movie").map((g) => ({
                        ...g,
                        xrel: false,
                        wcx: [],
                      })),
                      ...s.rows,
                    ]}
                    count={countOf(s.key, s.rows.length)}
                    href={(r) => (r.xrel ? xrelLinks.get(r.id) : (wcxUrl ?? undefined))}
                    mirrors={(r) => (r.wcx.length ? checkMirrors(r.wcx) : null)}
                    library={(r) => (head ? libraryNote(r, head.copies, head.mediaType === "movie") : null)}
                    aired={airedIn(s.key)}
                    {...(seasons
                      ? {
                          open: query.trim() !== "" || (folds.get(`${tileKey}:${s.key}`) ?? i === 0),
                          onToggle: () =>
                            setFolds((f) =>
                              new Map(f).set(`${tileKey}:${s.key}`, !(f.get(`${tileKey}:${s.key}`) ?? i === 0)),
                            ),
                        }
                      : {})}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );

  if (!overlay) return page;
  // Over the page it was opened from, right of the sidebar (w-52 from md
  // up), with a scroll of its own and the footer it covers. Below md under
  // the phone bar and its panels, whose search button has its toolbar.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={head?.title ?? "Releases"}
      className="fixed inset-0 z-10 flex flex-col overflow-y-auto overscroll-contain bg-background px-safe md:left-52 md:z-40 max-md:top-12"
    >
      {page}
      <Footer />
    </div>
  );
}
