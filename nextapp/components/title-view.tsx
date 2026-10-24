"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChevronLeft, Clapperboard, Eye, EyeOff, SearchX } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Footer } from "@/components/footer";
import { Poster } from "@/components/poster";
import { FacetMenu, FilterChips, type Facet } from "@/components/filter-menu";
import { isPhone } from "@/components/page-tools";
import { SearchInput } from "@/components/search-input";
import { LinkMirror, MatchMenu, ReleaseTable, useMirrorCheck } from "@/components/title-releases";
import { PosterWish, type Result } from "@/components/request-tiles";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { IGNORES_CHANGED, RELEASES_CHANGED, apiFetch, tmdbImage, tmdbUrl, jsonRequest } from "@/lib/api-client";
import type {
  IgnoredResponse,
  MatchInfo,
  ReleaseDetail,
  WcxRelease,
  WcxReleasesResponse,
  WcxSearchResponse,
} from "@/lib/api-types";
import { plural } from "@/lib/format";
import { matchesWords } from "@/lib/text";
import { NO_GROUP, matchNote } from "@/lib/release-labels";
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
  dloadRow,
  noRowFilters,
  seasonGroups,
  sortRows,
  toggleFilter,
  xrelRow,
  type RowFacetKey,
  RESOLUTIONS,
} from "@/lib/title-rows";
import { Dot, Dots } from "@/components/dot";

// The menus after Quality: a show's seasons.
const FACET_KEYS: RowFacetKey[] = ["season"];
// The Quality menu's picks, several at once, none to start with (all);
// ones a title has none of don't count, and with none left it shows all.
type Quality = (typeof RESOLUTIONS)[number];

const KIND = { movie: "Movie", tv: "Show" } as const;

const releasesUrl = (key: string, query: string) => `/api/releases/${encodeURIComponent(key)}${query && `?${query}`}`;

// The Quality menu's entry for every quality, and the qualities it lists below it, lowest first.
const ALL = "all";
const QUALITIES: Quality[] = ["720p", "1080p", "2160p"];

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
  // Not remembered: all on opening a title, but FHD on a phone (with none of
  // the picked on the title, none, so all show). Only the picked qualities
  // are fetched.
  const [quality, setQuality] = useState<Quality[]>(() => (isPhone() ? ["1080p"] : []));
  // Picked by hand: then it stays, with or without releases.
  const [touched, setTouched] = useState(false);
  const resolutionQuery = new URLSearchParams(quality.map((q) => ["resolution", q])).toString();

  useEffect(() => {
    let cancelled = false;
    apiFetch<ReleaseDetail>(releasesUrl(tileKey, resolutionQuery))
      .then((res) => !cancelled && setDetail({ key: tileKey, value: res }))
      .catch((e) => !cancelled && setFailed({ key: tileKey, message: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [tileKey, resolutionQuery]);

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
  const [wcxList, setWcxList] = useState<{
    tmdbId: string;
    releases: WcxRelease[];
    resolutions: Record<string, string[]>;
    error: string;
  } | null>(null);
  useEffect(() => {
    if (!tmdbId || !wcxUrl) return;
    let cancelled = false;
    apiFetch<WcxReleasesResponse>(
      `/api/wcx-releases?tmdbId=${encodeURIComponent(tmdbId)}${resolutionQuery && `&${resolutionQuery}`}`,
    )
      .then(
        (res) => !cancelled && setWcxList({ tmdbId, releases: res.releases, resolutions: res.resolutions, error: "" }),
      )
      .catch((e) => !cancelled && setWcxList({ tmdbId, releases: [], resolutions: {}, error: (e as Error).message }));
    return () => {
      cancelled = true;
    };
  }, [tmdbId, wcxUrl, resolutionQuery]);
  const wcxReleases = wcxUrl && wcxList?.tmdbId === tmdbId ? wcxList : null;
  const checkMirrors = useMirrorCheck(tmdbId);

  // One search and filter over both tables.
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(noRowFilters);
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
        releasesUrl(current.key, resolutionQuery),
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

  // A show the library has can be left out of the Dashboard's Incomplete
  // shows from the ⋯ beside its name (Settings lists what's ignored).
  const showId = head?.mediaType === "tv" ? (head.library?.id ?? null) : null;
  const [ignored, setIgnored] = useState<string[] | null>(null);
  useEffect(() => {
    if (!showId) return;
    let cancelled = false;
    apiFetch<IgnoredResponse>("/api/ignored")
      .then((res) => !cancelled && setIgnored(res.items.map((e) => e.showId)))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showId]);
  const isIgnored = Boolean(showId && ignored?.includes(showId));

  async function toggleIgnore() {
    if (!showId) return;
    try {
      const res = await apiFetch<IgnoredResponse>(
        "/api/ignored",
        jsonRequest(isIgnored ? "DELETE" : "POST", { showId }),
      );
      setIgnored(res.items.map((e) => e.showId));
      window.dispatchEvent(new Event(IGNORES_CHANGED));
    } catch (e) {
      toast("Couldn't change the ignore list", { description: (e as Error).message, tone: "error" });
    }
  }
  const ignoreItem =
    showId && ignored ? (
      <DropdownMenuItem onClick={toggleIgnore}>
        {isIgnored ? <Eye /> : <EyeOff />}
        {isIgnored ? "Unignore show" : "Ignore show"}
      </DropdownMenuItem>
    ) : undefined;

  const titles = current?.titles ?? [];
  const single = titles.length === 1 ? titles[0] : null;

  const xrel = titles.map((t) => ({ ...t, rows: t.items.map(xrelRow) }));
  const allRows = allRowsOf(titles, wcxReleases?.releases ?? []);
  // The qualities the title has (the server says, however few come down) and
  // the release names of each, from xREL's list and WCX's.
  const names = new Map<string, Set<string>>();
  for (const list of [current?.resolutions, wcxReleases?.resolutions])
    for (const [q, ns] of Object.entries(list ?? {})) names.set(q, new Set([...(names.get(q) ?? []), ...ns]));
  const have = new Set(names.keys());
  // Nothing of the picked on the title (FHD on opening): none picked, so all come down.
  const loaded = Boolean(current && (!wcxUrl || wcxReleases));
  const noneOfPicked = loaded && !touched && quality.length > 0 && !quality.some((q) => have.has(q));
  // Set while rendering, so the page never shows the empty list of a quality it hasn't.
  if (noneOfPicked) setQuality([]);
  // One quality at a time, or All, lowest first.
  const qualityLabel = (q: string) => (q === ALL ? "All" : formatFacet("resolution", q));
  const qualityFacet: Facet = {
    key: "quality",
    label: "Quality",
    // Always every one that matters (not SD), whether the title has it or not.
    values: [ALL, ...QUALITIES],
    selected: new Set(quality.length ? quality : [ALL]),
    onToggle: (q) => {
      setTouched(true);
      setQuality(q === ALL ? [] : [q as Quality]);
    },
    format: qualityLabel,
    single: true,
  };
  const keep = keepRow(query, { ...filters, resolution: new Set(quality) });
  const xrelLinks = new Map(titles.flatMap((t) => t.items.map((r) => [r.id, r.link] as const)));
  // The DLoad uploaders' threads: a row each, but one xREL lists too (by name) stays xREL's.
  const dload = current?.dload ?? [];
  const dloadLinks = new Map<string, string>(dload.map((d) => [`dload:${d.id}`, d.url]));
  const dloadByName = new Map(dload.map((d) => [d.name.toLowerCase(), d.url]));
  const dloadOf = (r: { id: string; name: string }) => dloadLinks.get(r.id) ?? dloadByName.get(r.name.toLowerCase());
  const onXrel = new Set(xrel.flatMap((t) => t.rows.map((r) => r.name.toLowerCase())));
  // xREL's and WCX's as one list, each row tagged with where it's listed
  // and with the mirror buttons of every WCX copy (two a line on a phone).
  const combined = [
    ...combineRows(
      xrel.flatMap((t) => t.rows),
      wcxReleases?.releases ?? [],
    ),
    ...dload
      .map(dloadRow)
      .filter((r) => !onXrel.has(r.name.toLowerCase()))
      .map((r) => ({ ...r, xrel: false, wcx: [] })),
  ];
  // How many releases each quality has among those the search leaves (what
  // picking it would show).
  const matchesQuery = matchesWords(query);
  const qualityCounts = new Map([...names].map(([q, ns]) => [q, [...ns].filter(matchesQuery).length]));
  qualityCounts.set(ALL, [...new Set([...names.values()].flatMap((ns) => [...ns]))].filter(matchesQuery).length);
  const shown = sortRows(combined.filter(keep), "date", "desc");
  // A show's releases as a table per season, also each season the library has (the season
  // menu's picks); a movie's (or a show with no season in names or library) as one.
  const owned = [...new Set((head?.copies ?? []).flatMap((c) => (c.season === null ? [] : [c.season])))].filter(
    (n) => !filters.season.size || filters.season.has(String(n)),
  );
  const seasons =
    head?.mediaType !== "movie" && (owned.length || shown.some((r) => r.seasons)) ? seasonGroups(shown, owned) : null;
  // A season table's aired and known episodes (TMDB's), for its Episodes
  // column; none for Other.
  const airedIn = (key: string) => {
    const season = /^(\d+)-\1$/.exec(key)?.[1];
    return season ? (head?.aired?.[Number(season)] ?? null) : null;
  };
  // A heading's count: its releases, then a season's aired episodes ("8 of 10 aired" while it runs).
  const countOf = (key: string, releases: number) => {
    const a = airedIn(key);
    const aired = a && (a.total > a.aired ? `${a.aired} of ${a.total} aired` : `${a.aired} aired`);
    const parts = [releases ? plural(releases, "release") : null, aired].filter(Boolean);
    return parts.length ? parts : undefined;
  };
  // The library's files for a table (its gray rows first): a season's ("2-2", a pack's "1-3")
  // episodes, a movie's all; none for the releases without a season.
  const copiesIn = (key: string) => {
    const range = /^(\d+)-(\d+)$/.exec(key);
    if (!range) return key === "all" ? (head?.copies ?? []) : [];
    const [from, to] = [Number(range[1]), Number(range[2])];
    return (head?.copies ?? []).filter((c) => c.season !== null && c.season >= from && c.season <= to);
  };
  // The tables, also the library's alone when no release is left (none listed, or none matching).
  const tables = (
    seasons ?? [{ key: "all", label: head?.mediaType === "movie" ? "Movies" : "Releases", rows: shown }]
  ).filter((s) => s.rows.length || copiesIn(s.key).length);
  const facets: Facet[] = FACET_KEYS.map((key) => ({
    key,
    label: FACET_LABELS[key],
    values: facetValues(key, allRows).length > 1 || filters[key].size ? facetValues(key, allRows) : [],
    selected: filters[key],
    onToggle: (v: string) => setFilters((f) => toggleFilter(f, key, v)),
    format: (v: string) => formatFacet(key, v),
  }));
  // One group at a time, or All, filtered here (the rows are all there): a count each,
  // among those the search and the other filters leave.
  const groupNames = facetValues("group", allRows);
  const groupRows = combined.filter(keepRow(query, { ...filters, group: new Set() }));
  const groupFacet: Facet = {
    key: "group",
    label: FACET_LABELS.group,
    values: [ALL, ...groupNames],
    counts: new Map([
      [ALL, groupRows.length],
      ...groupNames.map((g) => [g, groupRows.filter((r) => (r.group ?? NO_GROUP) === g).length] as const),
    ]),
    selected: filters.group.size ? filters.group : new Set([ALL]),
    onToggle: (v) => setFilters((f) => ({ ...f, group: v === ALL ? new Set() : new Set([v]) })),
    format: (v) => (v === ALL ? "All" : v),
    single: true,
  };
  // The picks, the quality's first: on a phone held upright, where the menus are
  // left out, they're what shows that a filter is on (FHD on opening).
  const chips = [
    ...quality.map((q) => ({
      id: `quality-${q}`,
      label: qualityLabel(q),
      onRemove: () => setQuality([]),
    })),
    ...[...filters.group].map((g) => ({
      id: `group-${g}`,
      label: g,
      onRemove: () => setFilters((f) => ({ ...f, group: new Set() })),
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
    <EmptyState icon={SearchX} title="No releases match" hint="Try a different search or remove a filter." />
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
  const linkQuery = tmdbId && head ? "?" + new URLSearchParams({ tmdbId, title: head.title }) : null;
  const links = [
    tmdb ? { label: "TMDB", href: tmdb } : null,
    linkQuery ? { label: "xREL", href: "/api/xrel-link" + linkQuery } : null,
    wcxUrl ? { label: "WCX", href: wcxUrl } : null,
  ].filter((l): l is { label: string; href: string } => l !== null);

  const matchMenu = head ? (
    <MatchMenu
      label={head.title}
      match={single?.match}
      saving={single ? saving === single.titleKey : false}
      onPick={(v) => single && decide(single.titleKey, v)}
    >
      {ignoreItem}
    </MatchMenu>
  ) : null;

  const page = (
    <main className="w-full max-w-[90rem] px-4 py-4 sm:px-6 sm:py-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={back}
          autoFocus={overlay}
          className="-ml-1 flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ChevronLeft className="size-4" />
          Back
        </button>
        {/* On a phone the title's ⋯ is up here, at the right of Back. */}
        <div className="-my-1.5 -mr-2 md:hidden">{matchMenu}</div>
      </div>
      {/* The page's name is in the phone bar below md; the title's own name is the heading here. */}
      <h1 className="sr-only">Releases</h1>

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
                  <div className="max-md:hidden">{matchMenu}</div>
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
                      <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 max-sm:basis-full">
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
          <div className="mt-4 flex flex-wrap items-center gap-2 md:mt-6">
            <SearchInput
              value={query}
              onChange={setQuery}
              placeholder={`Search ${plural(combined.length, "release")}`}
              size="lg"
              grow
            />
            {/* Like Movies' and Discover's: a phone held upright shows the search alone.
                  The Quality and Group menus are always there, even for a title with one value or none. */}
            <FacetMenu facet={{ ...qualityFacet, counts: qualityCounts }} className="phone-portrait:hidden" />
            <FacetMenu facet={groupFacet} className="phone-portrait:hidden" />
            {facets.map((f) => (
              <FacetMenu key={f.key} facet={f} className="phone-portrait:hidden" />
            ))}
          </div>
          <FilterChips
            chips={chips}
            onClear={() => {
              setFilters(noRowFilters());
              setQuality([]);
            }}
          />

          {/* One table, right under the toolbar (how many there are is
              in the line under the title). */}
          <section aria-label="Releases" className="mt-4 md:mt-6">
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
                        <Dot /> <Dots parts={[plural(t.rows.length, "release"), matchNote(t.match)]} />
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
            {!combined.length && !head?.copies.length ? (
              <EmptyState
                icon={Clapperboard}
                title="No releases"
                hint={`None of your favorite groups has released this${wcxUrl ? ", and WCX has nothing" : ""}.`}
              />
            ) : !tables.length ? (
              noMatch
            ) : (
              <div className="flex flex-col gap-3">
                {tables.map((s, i) => (
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
                    href={(r) => (r.xrel ? xrelLinks.get(r.id) : (dloadLinks.get(r.id) ?? wcxUrl ?? undefined))}
                    mirrors={(r) =>
                      r.wcx.length ? (
                        checkMirrors(r.wcx)
                      ) : dloadOf(r) ? (
                        <LinkMirror label="DLoad" href={dloadOf(r)!} />
                      ) : r.xrel && r.group?.toLowerCase() === "fun" && linkQuery ? (
                        <LinkMirror label="FunXD" href={"/api/funxd-link" + linkQuery} />
                      ) : null
                    }
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
  // the phone bar and its menu panel.
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
