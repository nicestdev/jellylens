"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, Library as LibraryIcon } from "lucide-react";
import { Poster } from "@/components/poster";
import { FacetMenu, FilterChips, type Facet } from "@/components/filter-menu";
import { SearchInput } from "@/components/search-input";
import { useStoredChoice } from "@/hooks/use-stored-choice";
import { MatchMenu, ReleaseTable, MirrorGroups, useMirrors } from "@/components/title-releases";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonVariants } from "@/components/ui/button";
import { RELEASES_CHANGED, apiFetch, tmdbImage, tmdbUrl, jsonRequest } from "@/lib/api-client";
import type { MatchInfo, ReleaseDetail, WcxRelease, WcxReleasesResponse, WcxSearchResponse } from "@/lib/api-types";
import { plural } from "@/lib/format";
import { matchNote } from "@/lib/release-labels";
import { onlyFilter, titlePath } from "@/lib/title-path";
import { toast } from "@/lib/toast";
import {
  FACET_LABELS,
  facetValues,
  formatFacet,
  keepRow,
  allRowsOf,
  combineRows,
  libraryNote,
  noRowFilters,
  RELEASE_SORTS,
  sortRows,
  toggleFilter,
  xrelRow,
  type ReleaseRow,
  type ReleaseSortKey,
  type RowFacetKey,
  RESOLUTIONS,
} from "@/lib/title-rows";
import { SortMenu } from "@/components/sort-menu";
import type { SortDir } from "@/lib/facets";

// The menus after Quality: a show's seasons.
const FACET_KEYS: RowFacetKey[] = ["season"];
// The Quality menu's picks (1080p unless picked otherwise); one a title has none of counts as All.
const QUALITIES = ["all", ...RESOLUTIONS] as const;

const KIND = { movie: "Movie", tv: "Show" } as const;

// A title's page (app/title/[kind]/[id]): poster, name and links on top,
// then every release the favorite groups put out on xREL and what WCX has
// to download, as tables. Releases, Upgrades, Discover, the Wishlist and
// Missing open it over themselves (overlay, app/@modal), so going back
// finds them as they were; a link opened on its own is the plain page.
// A ?group=… from Upgrades lists only that group's releases in one
// quality, codec and season (onlyFilter in lib/title-path.ts).
export function TitleView({ tileKey, overlay = false }: { tileKey: string; overlay?: boolean }) {
  const router = useRouter();
  const only = onlyFilter(useSearchParams());
  // Tagged with the key they belong to, so another title never shows the
  // last one's list (or error) for a moment.
  const [detail, setDetail] = useState<{ key: string; value: ReleaseDetail } | null>(null);
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
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
  const mirrors = useMirrors(tmdbId);

  // One search and filter over both tables.
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(noRowFilters);
  const [sortKey, setSortKey] = useState<ReleaseSortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // A single-pick filter next to the others, 1080p unless picked otherwise
  // (remembered in this browser).
  const [quality, setQuality] = useStoredChoice("jellylens.title.quality", QUALITIES, "1080p");

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
    else router.push("/releases");
  }

  async function decide(titleKey: string, verdict: MatchInfo["verdict"]) {
    if (!current) return;
    setSaving(titleKey);
    try {
      const res = await apiFetch<ReleaseDetail>(
        `/api/releases/${encodeURIComponent(current.key)}`,
        jsonRequest("POST", { titleKey, verdict }),
      );
      window.dispatchEvent(new Event(RELEASES_CHANGED));
      // The title may be another tile now: follow it there.
      if (res.key !== tileKey) {
        setDetail({ key: res.key, value: res });
        router.replace(titlePath(res.key));
      } else {
        setDetail({ key: tileKey, value: res });
      }
    } catch (e) {
      // The list is still right; only the decision didn't stick.
      toast("Couldn't change the match", { description: (e as Error).message, tone: "removed" });
    } finally {
      setSaving(null);
    }
  }

  const titles = (current?.titles ?? [])
    .map((t) => (only ? { ...t, Items: t.Items.filter(only.keep) } : t))
    .filter((t) => !only || t.Items.length);
  const single = titles.length === 1 ? titles[0] : null;

  const xrel = titles.map((t) => ({ ...t, rows: t.Items.map(xrelRow) }));
  const allRows = allRowsOf(titles, wcxReleases?.releases ?? []);
  const have = new Set(facetValues("resolution", allRows));
  const qualities = QUALITIES.filter((q) => q !== "all" && have.has(q));
  const pickedQuality = qualities.includes(quality) ? quality : "all";
  const keep = keepRow(query, { ...filters, resolution: new Set(pickedQuality === "all" ? [] : [pickedQuality]) });
  const xrelLinks = new Map(titles.flatMap((t) => t.Items.map((r) => [r.id, r.link] as const)));
  // xREL's and WCX's as one list, each row tagged with where it's listed
  // and with the mirror buttons of every WCX copy (two a line on a phone).
  const combined = combineRows(
    xrel.flatMap((t) => t.rows),
    wcxReleases?.releases ?? [],
  );
  const shown = sortRows(combined.filter(keep), sortKey, sortDir);
  const facets: Facet[] = FACET_KEYS.map((key) => ({
    key,
    label: FACET_LABELS[key],
    values: facetValues(key, allRows).length > 1 || filters[key].size ? facetValues(key, allRows) : [],
    selected: filters[key],
    onToggle: (v: string) => setFilters((f) => toggleFilter(f, key, v)),
    format: (v: string) => formatFacet(key, v),
  }));
  const chips = FACET_KEYS.flatMap((key) =>
    [...filters[key]].map((v) => ({
      id: `${key}-${v}`,
      label: formatFacet(key, v),
      onRemove: () => setFilters((f) => toggleFilter(f, key, v)),
    })),
  );
  const copies = head?.copies ?? [];
  const library = (r: ReleaseRow) => libraryNote(r, copies, head?.mediaType === "movie");
  const noMatch = (
    <p className="text-sm text-muted-foreground">No releases match. Try a different search or remove a filter.</p>
  );
  const note = single
    ? matchNote(single.match)
    : titles.length > 1
      ? `Grouped from ${titles.length} xREL titles, each matched on its own.`
      : null;
  const poster = head?.library?.imageTag
    ? { itemId: head.library.id, tag: head.library.imageTag }
    : { imageSrc: tmdbImage(head?.posterPath) };
  const tmdb = head?.tmdbId && head.mediaType ? tmdbUrl(head.mediaType, head.tmdbId) : undefined;
  const links = [tmdb ? { label: "TMDB", href: tmdb } : null, wcxUrl ? { label: "WCX", href: wcxUrl } : null].filter(
    (l): l is { label: string; href: string } => l !== null,
  );

  const page = (
    <main className="w-full max-w-[1440px] px-4 py-5 sm:px-6">
      <button
        type="button"
        onClick={back}
        className="-ml-1 flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Back
      </button>

      <header className="mt-4 flex gap-5">
        {head ? (
          <Poster {...poster} alt="" height={480} className="w-28 rounded-lg sm:w-36" />
        ) : (
          <Skeleton className="aspect-2/3 w-28 shrink-0 rounded-lg sm:w-36" />
        )}
        <div className="min-w-0 flex-1 pt-1">
          {head ? (
            <>
              <div className="flex items-start gap-2">
                <h1 className="min-w-0 text-2xl font-semibold text-balance">{head.title}</h1>
                {single ? (
                  <div className="pt-0.5">
                    <MatchMenu
                      label={head.title}
                      match={single.match}
                      saving={saving === single.titleKey}
                      onPick={(v) => decide(single.titleKey, v)}
                    />
                  </div>
                ) : null}
              </div>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-sm text-muted-foreground">
                {[
                  head.year ? (
                    <span key="y" className="font-num tabular-nums">
                      {head.year}
                    </span>
                  ) : null,
                  head.mediaType ? <span key="k">{KIND[head.mediaType]}</span> : null,
                  combined.length ? <span key="r">{plural(combined.length, "release")}</span> : null,
                  head.library ? (
                    <span key="l" className="inline-flex items-center gap-1 self-center text-warning">
                      <LibraryIcon className="size-3.5" />
                      Library
                    </span>
                  ) : null,
                ]
                  .filter(Boolean)
                  .flatMap((el, i) => (i ? [<span key={`s${i}`}>·</span>, el] : [el]))}
              </p>
              {note ? <p className="mt-2 text-xs text-muted-foreground">{note}</p> : null}
              {only ? <p className="mt-2 text-xs text-muted-foreground">{only.note}</p> : null}
              {links.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {links.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </>
          ) : error ? null : current ? (
            <h1 className="text-2xl font-semibold">Not found</h1>
          ) : (
            <>
              <Skeleton className="h-8 w-2/3 max-w-96" />
              <Skeleton className="mt-2 h-4 w-40" />
            </>
          )}
        </div>
      </header>

      {error ? (
        <p className="mt-8 text-sm text-destructive">Failed to load releases: {error}</p>
      ) : !current ? (
        <div className="mt-8 flex flex-col gap-1.5">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap items-center gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search releases…" className="w-full sm:w-64" />
            {qualities.length > 1 ? (
              <FacetMenu
                facet={{
                  key: "quality",
                  label: "Quality",
                  values: [...qualities, "all"],
                  selected: new Set([pickedQuality]),
                  onToggle: (q) => setQuality(q as (typeof QUALITIES)[number]),
                  format: (q) => (q === "all" ? "All" : formatFacet("resolution", q)),
                  single: true,
                  changed: pickedQuality !== "1080p",
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
          <FilterChips chips={chips} onClear={() => setFilters(noRowFilters())} />

          {/* One table, right under the toolbar like Upgrades' (how many
              there are is in the line under the title). */}
          <section aria-label="Releases" className="mt-3">
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
                    <p className="min-w-0 flex-1 text-[13px]">
                      <span className="font-medium">{t.label}</span>
                      <span className="text-muted-foreground">
                        {" · "}
                        {[plural(t.rows.length, "release"), matchNote(t.match)].filter(Boolean).join(" · ")}
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
              <ReleaseTable
                library={library}
                rows={shown}
                href={(r) => (r.xrel ? xrelLinks.get(r.id) : (wcxUrl ?? undefined))}
                action={(r) => (r.wcx.length ? <MirrorGroups copies={r.wcx} render={mirrors} /> : null)}
              />
            )}
          </section>
        </>
      )}
    </main>
  );

  if (!overlay) return page;
  // Over the page it was opened from, right of the sidebar (w-52 from md
  // up), with a scroll of its own.
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={head?.title ?? "Releases"}
      className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-background md:left-52"
    >
      {page}
    </div>
  );
}
