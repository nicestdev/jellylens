// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { wholeText } from "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { RELEASES_CHANGED } from "@/lib/api-client";
import type { MatchInfo, ReleaseDetail, ReleaseDetailTitle, ReleaseHead, WcxRelease } from "@/lib/api-types";
import { dismissToast, getToasts } from "@/lib/toast";
import { Toaster } from "./toaster";
import { TitleView } from "./title-view";

const router = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeEach(() => {
  Object.values(router).forEach((f) => f.mockReset());
});

afterEach(() => {
  act(() => {
    for (const t of getToasts()) dismissToast(t.id);
  });
});

const heat = { title: "Heat", year: 1995, posterPath: "/heat.jpg", mediaType: "movie" as const, tmdbId: 949 };
const head: ReleaseHead = { ...heat, library: null, copies: [], aired: null };

const match = (over: Partial<MatchInfo> = {}): MatchInfo => ({
  status: "verified",
  shown: heat,
  verdict: null,
  candidate: null,
  ...over,
});

const title = (
  titleKey: string,
  label: string,
  names: string[],
  over: Partial<MatchInfo> = {},
): ReleaseDetailTitle => ({
  titleKey,
  label,
  match: match(over),
  items: names.map((name, i) => ({
    id: titleKey + i,
    name,
    link: "https://xrel.example/" + titleKey + i,
    quality: "HD-2160p",
    publishedAt: 1790000000,
    group: name.split("-").pop()!,
    sizeMb: null,
  })),
});

const bluray = title("heat~1995", "Heat (1995)", ["Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR"]);
const rip = title("heat", "Heat", ["Heat.German.AC3.HDRip.XViD-VECTOR"], { status: "searched" });

// Answers GET /api/releases/<key> with detail, POSTs with after(body).
// Also handles /api/wcx-search, always returning null.
function api(detail: ReleaseDetail, after?: (body: { titleKey: string; verdict: string | null }) => ReleaseDetail) {
  return mockFetch((url, init) => {
    if (url.pathname === "/api/wcx-search") return json({ url: null });
    if (url.pathname !== "/api/releases/" + encodeURIComponent(detail.key)) return undefined;
    if (init?.method === "POST") return json(after!(JSON.parse(String(init.body))));
    return json(detail);
  });
}

// The line under the name: year, kind, how many releases.
const meta = () => screen.getByRole("heading", { level: 2 }).parentElement!.nextElementSibling!;
// How many releases the table lists (none: no table at all).
const shownCount = () => document.querySelectorAll("tbody tr").length;
// A release name's link: its name may wrap after its dots (<wbr>), which
// the test DOM reads as spaces.
const release = (re: RegExp) => (name: string) => re.test(name.replace(/ /g, ""));
// The table row a release's name is in.
const row = (name: RegExp) => screen.getByRole("link", { name: release(name) }).closest("tr")!;

// Picks a quality in the Quality menu, or drops it if it's picked (it
// takes several).
async function pickQuality(q: string) {
  await userEvent.click(screen.getByRole("button", { name: /^Quality/ }));
  await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: q }));
  await userEvent.keyboard("{Escape}");
}

describe("TitleView", () => {
  it("lists a single title's releases with its menu beside the name", async () => {
    const fetch = api({ key: "movie:949", head, titles: [bluray] }, () => ({
      key: "movie:949",
      head,
      titles: [{ ...bluray, match: match({ status: "rejected", verdict: "wrong" }) }],
    }));
    const changed = vi.fn();
    window.addEventListener(RELEASES_CHANGED, changed);
    render(<TitleView tileKey="movie:949" />);

    expect(await screen.findByRole("link", { name: release(/German\.DL\.2160p\.UHD/) })).toHaveAttribute(
      "href",
      "https://xrel.example/heat~19950",
    );
    expect(screen.getByRole("heading", { level: 2, name: "Heat" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Releases" })).toBeInTheDocument();
    expect(meta()).toHaveTextContent("1995·Movie·1 release");
    expect(shownCount()).toBe(1);
    // Its name without the title; no WCX page here, so no mirrors.
    const bluRay = row(/German\.DL\.2160p\.UHD/);
    expect(within(bluRay).getByRole("link")).toHaveTextContent(/^German\.DL\.2160p\.UHD\.BluRay\.x265-VECTOR$/);
    expect(within(bluRay).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Grouped from/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));

    expect(await screen.findByText("Marked as a wrong match by you.")).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/releases/movie%3A949");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ titleKey: "heat~1995", verdict: "wrong" });
    // The list it was opened over loads again; the page stays where it is.
    expect(changed).toHaveBeenCalledOnce();
    expect(router.replace).not.toHaveBeenCalled();
    window.removeEventListener(RELEASES_CHANGED, changed);
  });

  it("follows a title that leaves the tile to its own page", async () => {
    api({ key: "movie:949", head, titles: [bluray] }, () => ({
      key: "heat~1995",
      head: { ...head, posterPath: null, mediaType: null, tmdbId: null },
      titles: [{ ...bluray, match: match({ status: "rejected", verdict: "wrong" }) }],
    }));
    render(<TitleView tileKey="movie:949" />);
    await userEvent.click(await screen.findByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));
    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith("/title/xrel/heat~1995"));
  });

  it("keeps the releases when a match change fails, and says so", async () => {
    mockFetch((url, init) => {
      if (url.pathname === "/api/wcx-search") return json({ url: null });
      if (init?.method === "POST") return json({ error: "database is locked" }, { status: 500 });
      return json({ key: "movie:949", head, titles: [bluray] });
    });
    render(
      <>
        <TitleView tileKey="movie:949" />
        <Toaster />
      </>,
    );
    await userEvent.click(await screen.findByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));
    expect(await screen.findByText("Couldn't change the match")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: release(/German\.DL\.2160p\.UHD/) })).toBeInTheDocument();
    expect(screen.queryByText(/Failed to load releases/)).not.toBeInTheDocument();
  });

  it("lists every title on a merged tile with its menu, over one table of their releases", async () => {
    const fetch = api({ key: "movie:949", head, titles: [bluray, rip] }, ({ titleKey }) => ({
      key: "movie:949",
      head,
      titles: [titleKey === "heat" ? bluray : rip],
    }));
    render(<TitleView tileKey="movie:949" />);

    expect(await screen.findByText("Grouped from 2 xREL titles, each matched on its own.")).toBeInTheDocument();
    expect(meta()).toHaveTextContent("1995·Movie·2 releases");
    expect(shownCount()).toBe(2);
    // No menu beside the name: each title has its own.
    const name = screen.getByRole("heading", { level: 2 }).parentElement!;
    expect(within(name).queryByRole("button")).not.toBeInTheDocument();
    const part = screen.getByText(/Found on TMDB by its release name/).closest("p")!.parentElement!;
    expect(part).toHaveTextContent(/^Heat · 1 release · Found on TMDB/);
    expect(screen.getByText("Heat (1995)").closest("p")).toHaveTextContent(/^Heat \(1995\) · 1 release/);
    expect(screen.getByRole("button", { name: "More options for Heat (1995)" })).toBeInTheDocument();
    // Both titles' releases in the one table.
    expect(screen.getAllByRole("table")).toHaveLength(1);
    expect(within(screen.getByRole("table")).getByText(/HDRip/)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText(/2160p\.UHD/)).toBeInTheDocument();

    await userEvent.click(within(part).getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));

    // The rip left the tile; the BluRay stays, now on its own.
    await vi.waitFor(() => expect(meta()).toHaveTextContent("1995·Movie·1 release"));
    expect(screen.queryByText(/HDRip/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Grouped from/)).not.toBeInTheDocument();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/releases/movie%3A949");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ titleKey: "heat", verdict: "wrong" });
  });

  it("says when the releases can't be loaded", async () => {
    mockFetch(() => json({ error: "database is locked" }, { status: 500 }));
    render(<TitleView tileKey="movie:949" />);
    expect(await screen.findByText("Failed to load releases: database is locked")).toBeInTheDocument();
  });

  it("says when no favorite group has released the title", async () => {
    api({ key: "movie:949", head, titles: [] });
    render(<TitleView tileKey="movie:949" />);
    expect(await screen.findByText("None of your favorite groups has released this.")).toBeInTheDocument();
    expect(shownCount()).toBe(0);
    // xREL links to the title's page there even without releases.
    expect(meta()).toHaveTextContent(/^1995·Movie·TMDB·xREL$/);
    expect(screen.getByRole("link", { name: "xREL" })).toHaveAttribute(
      "href",
      "/api/xrel-link?tmdbId=movie%3A949&title=Heat",
    );
  });

  it("lists a show's releases as a table per season, the newest open, the rest folded", async () => {
    const show = title("got", "Game of Thrones", [
      "Game.of.Thrones.S01.German.DL.2160p.UHD.BluRay.x265-PL3X",
      "Game.of.Thrones.S01.German.DL.1080p.BluRay.x264-GTVG",
      "Game.of.Thrones.S02.German.DL.1080p.BluRay.x264-JaJunge",
    ]);
    api({
      key: "tv:1399",
      head: { ...head, title: "Game of Thrones", year: 2011, mediaType: "tv", tmdbId: 1399 },
      titles: [show],
    });
    render(<TitleView tileKey="tv:1399" />);

    expect(await screen.findByText(/x264-JaJunge/)).toBeInTheDocument();
    expect(meta()).toHaveTextContent("2011·Show·3 releases");
    const season2 = screen.getByRole("button", { name: /^Season 2/ });
    const season1 = screen.getByRole("button", { name: /^Season 1/ });
    expect(season2).toHaveTextContent("Season 2 · 1 release");
    expect(season2).toHaveAttribute("aria-expanded", "true");
    expect(season1).toHaveTextContent("Season 1 · 2 releases");
    expect(season1).toHaveAttribute("aria-expanded", "false");
    expect(shownCount()).toBe(1);
    await userEvent.click(season1);
    expect(shownCount()).toBe(3);
    await userEvent.click(season2);
    expect(shownCount()).toBe(2);
    expect(screen.queryByText(/x264-JaJunge/)).not.toBeInTheDocument();

    // A season clicked open or folded stays that way however the filters
    // narrow the list, first shown or not.
    await pickQuality("4K");
    expect(screen.getByRole("button", { name: /^Season 1/ })).toHaveAttribute("aria-expanded", "true");
    expect(shownCount()).toBe(1);
    await pickQuality("4K");
    expect(screen.getByRole("button", { name: /^Season 2/ })).toHaveAttribute("aria-expanded", "false");
    expect(shownCount()).toBe(2);
  });

  it("narrows the releases with the Quality and Season menus", async () => {
    const show = title("got", "Game of Thrones", [
      "Game.of.Thrones.S01.German.DL.2160p.UHD.BluRay.x265-PL3X",
      "Game.of.Thrones.S01.German.DL.1080p.BluRay.x264-GTVG",
      "Game.of.Thrones.S02.German.DL.1080p.BluRay.x264-JaJunge",
    ]);
    api({
      key: "tv:1399",
      head: { ...head, title: "Game of Thrones", year: 2011, mediaType: "tv", tmdbId: 1399 },
      titles: [show],
    });
    render(<TitleView tileKey="tv:1399" />);

    // Every quality to start with, nothing picked.
    expect(await screen.findByRole("button", { name: /^Season 1/ })).toHaveTextContent("Season 1 · 2 releases");
    expect(screen.getByRole("button", { name: /^Quality/ })).toHaveTextContent("Quality: All");
    await userEvent.click(screen.getByRole("button", { name: /^Quality/ }));
    expect(screen.getAllByRole("menuitemcheckbox").map((i) => i.textContent)).toEqual(["4K", "1080p"]);
    await userEvent.keyboard("{Escape}");
    await pickQuality("1080p");
    expect(screen.getByRole("button", { name: /^Season 1/ })).toHaveTextContent("Season 1 · 1 release");

    await userEvent.click(screen.getByRole("button", { name: /^Season:/ }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "S02" }));
    await userEvent.keyboard("{Escape}");
    expect(shownCount()).toBe(1);
    expect(screen.getByText(/x264-JaJunge/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Season 1/ })).not.toBeInTheDocument();

    // 4K alone has no S02: nothing left, until the season's chip is removed.
    await pickQuality("4K");
    await pickQuality("1080p");
    expect(shownCount()).toBe(0);
    expect(screen.getByText(/No releases match/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove S02" }));
    expect(shownCount()).toBe(1);
    expect(screen.getByText(/x265-PL3X/)).toBeInTheDocument();

    // Both qualities: all of them.
    await pickQuality("1080p");
    expect(screen.getByRole("button", { name: /^Season 2/ })).toHaveTextContent("Season 2 · 1 release");
    expect(screen.getByRole("button", { name: /^Season 1/ })).toHaveTextContent("Season 1 · 2 releases");
  });

  it("keeps a title and its menu when the Quality menu leaves nothing of it", async () => {
    api({
      key: "movie:949",
      head,
      titles: [bluray, { ...rip, items: rip.items.map((r) => ({ ...r, quality: "XviD" })) }],
    });
    render(<TitleView tileKey="movie:949" />);
    // Every quality to start with.
    await waitFor(() => expect(shownCount()).toBe(2));
    await pickQuality("4K");
    expect(shownCount()).toBe(1);
    expect(screen.queryByText(/HDRip/)).not.toBeInTheDocument();
    // The rip's title is still listed, to be matched another way.
    expect(screen.getByText(/Found on TMDB by its release name/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options for Heat" })).toBeInTheDocument();
    expect(screen.getByText("Heat (1995)")).toBeInTheDocument();
  });

  describe("WCX", () => {
    const wcxRelease = (over: Partial<WcxRelease>): WcxRelease => ({
      uid: "r",
      name: "Heat.1995.German.DL.1080p.BluRay.x264-WAYNE",
      group: "WAYNE",
      quality: "1080p",
      seasons: null,
      seasonEpisodes: null,
      size: 8589934592,
      createdAt: "2026-08-07T07:11:14.000000Z",
      mirrors: [
        { hoster: "ddownload.com", source: "wcx", links: 3, route: "ddownload", offline: false, container: null },
        { hoster: "rapidgator.net", source: "wcx", links: 3, route: null, offline: false, container: null },
      ],
      ...over,
    });
    const releases = [
      wcxRelease({ uid: "fhd" }),
      wcxRelease({
        uid: "uhd",
        name: "Heat.1995.German.DL.2160p.WebHD.h265-iNNOVATiV",
        group: "iNNOVATiV",
        quality: "2160p",
        mirrors: [
          { hoster: "ddownload.com", source: "wcx", links: 10, route: "ddownload", offline: true, container: null },
          {
            hoster: "ddownload.com",
            source: "filecrypt",
            links: 0,
            route: "ddownload",
            offline: false,
            container: "https://filecrypt.example/0000000002",
          },
        ],
      }),
    ];

    // The title's releases, its WCX page and what's on it; a POST (Check)
    // answers with check(body), by default adding the release.
    const added = {
      result: "added",
      packageId: 1,
      name: "Heat",
      started: true,
      hoster: "ddownload.com",
      source: "wcx",
    };
    function wcxApi(
      list = releases,
      titles = [bluray],
      check: (body: { releases: string[] }) => unknown = () => added,
    ) {
      return mockFetch((url, init) => {
        if (url.pathname === "/api/wcx-search") return json({ url: "https://wcx.example/detail/abc" });
        if (url.pathname === "/api/wcx-releases" && init?.method === "POST") {
          const answer = check(JSON.parse(String(init.body)));
          return answer instanceof Response ? answer : json(answer);
        }
        if (url.pathname === "/api/wcx-releases") return json({ releases: list });
        if (url.pathname === "/api/releases/movie%3A949") return json({ key: "movie:949", head, titles });
      });
    }
    // A release's Check button, by its (first copy's) name (the first of
    // its two: one in the Mirror column, one under the name for a phone).
    const checkButton = (name: string) =>
      screen.getAllByRole("button", { name: `Check its mirrors and add the first that works: ${name}` })[0];

    it("lists WCX's releases with xREL's, under the same Quality menu, and adds one with its Check", async () => {
      const fetch = wcxApi();
      render(
        <>
          <TitleView tileKey="movie:949" />
          <Toaster />
        </>,
      );
      // Every quality to start with: xREL's and WCX's together.
      expect(await screen.findByText(/x264-WAYNE/)).toBeInTheDocument();
      expect(shownCount()).toBe(3);
      expect(meta()).toHaveTextContent("1995·Movie·3 releases");
      expect(screen.queryByText(/No releases match/)).not.toBeInTheDocument();
      expect(screen.getByText(wholeText(/^WAYNE·1080p·x264·DL/))).toBeInTheDocument();
      // Its Check button in the Mirror column, and again under the name for a phone.
      expect(screen.getByRole("columnheader", { name: "Mirror" })).toBeInTheDocument();
      expect(within(row(/x264-WAYNE/)).getAllByRole("button", { name: /^Check its mirrors/ })).toHaveLength(2);
      expect(within(row(/x264-WAYNE/)).getByText("8.00 GB")).toBeInTheDocument();
      expect(within(row(/x264-WAYNE/)).getByText("07.08.2026")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: release(/x264-WAYNE/) })).toHaveAttribute(
        "href",
        "https://wcx.example/detail/abc",
      );
      expect(screen.getByRole("link", { name: "WCX" })).toHaveAttribute("href", "https://wcx.example/detail/abc");
      expect(String(fetch.mock.calls.find(([u]) => String(u).startsWith("/api/wcx-search"))![0])).toBe(
        "/api/wcx-search?tmdbId=movie%3A949",
      );

      // Newest first: xREL's (September 2026), then WCX's two (August).
      expect(
        within(screen.getByRole("table"))
          .getAllByRole("link", { name: /^German/ })
          .map((a) => a.textContent),
      ).toEqual([
        "German.DL.2160p.UHD.BluRay.x265-VECTOR",
        "German.DL.1080p.BluRay.x264-WAYNE",
        "German.DL.2160p.WebHD.h265-iNNOVATiV",
      ]);
      // xREL's alone has nothing to check.
      expect(within(row(/x265-VECTOR/)).queryByRole("button")).not.toBeInTheDocument();
      // 1080p: only WAYNE's, and none of xREL's.
      await pickQuality("1080p");
      expect(shownCount()).toBe(1);
      expect(screen.queryByText(/x265-VECTOR/)).not.toBeInTheDocument();

      await userEvent.click(within(row(/x264-WAYNE/)).getAllByRole("button", { name: /^Check its mirrors/ })[0]);
      // A note that it started, with a way to the Queue.
      expect(await screen.findByText("Download started")).toBeInTheDocument();
      expect(getToasts().at(-1)).toMatchObject({ description: "Heat", action: { label: "View", href: "/queue" } });
      // Once added, a check where the button was: it can't be added again.
      expect(within(row(/x264-WAYNE/)).getAllByRole("img", { name: "In the Queue, from DD (wcx)" })).toHaveLength(2);
      expect(within(row(/x264-WAYNE/)).queryByRole("button")).not.toBeInTheDocument();
      const post = fetch.mock.calls.find(([u, init]) => String(u) === "/api/wcx-releases" && init?.method === "POST")!;
      expect(JSON.parse(String(post[1]!.body))).toEqual({ tmdbId: "movie:949", releases: ["fhd"] });
    });

    it("offers a filecrypt container when no mirror is online, and says when there's none either", async () => {
      wcxApi(releases, [bluray], ({ releases: [uid] }) =>
        uid === "uhd"
          ? { result: "captcha", url: "https://filecrypt.example/0000000002", hoster: "ddownload.com" }
          : { result: "none" },
      );
      render(
        <>
          <TitleView tileKey="movie:949" />
          <Toaster />
        </>,
      );
      await screen.findByText(/x264-WAYNE/);

      await userEvent.click(within(row(/h265-iNNOVATiV/)).getAllByRole("button", { name: /^Check its mirrors/ })[0]);
      // A lock in its place, opening the container for its DLC, and a note.
      const [lock] = await within(row(/h265-iNNOVATiV/)).findAllByRole("link", {
        name: "Captcha: no mirror online, open ddownload.com on filecrypt for the DLC",
      });
      expect(lock).toHaveAttribute("href", "https://filecrypt.example/0000000002");
      expect(getToasts().at(-1)).toMatchObject({ title: "Behind a captcha: the lock opens it", tone: "warning" });

      await userEvent.click(within(row(/x264-WAYNE/)).getAllByRole("button", { name: /^Check its mirrors/ })[0]);
      expect(
        await within(row(/x264-WAYNE/)).findAllByRole("img", {
          name: "No mirror online, and no filecrypt container",
        }),
      ).toHaveLength(2);
      expect(getToasts().at(-1)).toMatchObject({ title: "No mirror online", mono: true, tone: "error" });
    });

    it("says when a Check fails, and lets it be tried again", async () => {
      wcxApi(releases, [bluray], () => json({ error: "WCX is down" }, { status: 502 }));
      render(
        <>
          <TitleView tileKey="movie:949" />
          <Toaster />
        </>,
      );
      await screen.findByText(/x264-WAYNE/);
      await userEvent.click(checkButton("Heat.1995.German.DL.1080p.BluRay.x264-WAYNE"));
      expect(await screen.findByText("Couldn't check its mirrors")).toBeInTheDocument();
      expect(screen.getByText("WCX is down")).toBeInTheDocument();
      expect(checkButton("Heat.1995.German.DL.1080p.BluRay.x264-WAYNE")).toBeEnabled();
    });

    it("says when WCX's releases can't be loaded", async () => {
      mockFetch((url) => {
        if (url.pathname === "/api/wcx-search") return json({ url: "https://wcx.example/detail/abc" });
        if (url.pathname === "/api/wcx-releases") return json({ error: "WCX is down" }, { status: 502 });
        if (url.pathname === "/api/releases/movie%3A949") return json({ key: "movie:949", head, titles: [bluray] });
      });
      render(<TitleView tileKey="movie:949" />);
      expect(await screen.findByText("Couldn't load WCX: WCX is down")).toBeInTheDocument();
      expect(shownCount()).toBe(1);
      // xREL's are still there.
      expect(row(/x265-VECTOR/)).toBeInTheDocument();
    });

    it("gives a release both list one row, checking every WCX copy at once", async () => {
      const name = bluray.items[0].name;
      const mirror = {
        hoster: "ddownload.com",
        source: "wcx" as const,
        links: 2,
        route: "ddownload",
        offline: false,
        container: null,
      };
      const fetch = wcxApi([
        wcxRelease({
          uid: "a",
          name: name.toLowerCase(),
          quality: "2160p",
          mirrors: [{ ...mirror, hoster: "rapidgator.net", route: null }],
        }),
        wcxRelease({ uid: "b", name, quality: "2160p", mirrors: [mirror] }),
      ]);
      render(<TitleView tileKey="movie:949" />);
      await vi.waitFor(() =>
        expect(within(row(/x265-VECTOR/)).getAllByRole("button", { name: /^Check its mirrors/ })).toHaveLength(2),
      );
      expect(shownCount()).toBe(1);
      expect(meta()).toHaveTextContent("1995·Movie·1 release");
      const both = row(/x265-VECTOR/);
      // The name goes to xREL's page; the size, xREL has none of, is WCX's.
      expect(within(both).getByRole("link", { name: release(/x265-VECTOR/) })).toHaveAttribute(
        "href",
        "https://xrel.example/heat~19950",
      );
      expect(within(both).getByText("8.00 GB")).toBeInTheDocument();
      // One Check for both copies: the server picks among their mirrors.
      await userEvent.click(checkButton(name.toLowerCase()));
      await vi.waitFor(() => expect(within(both).getAllByRole("img", { name: /^In the Queue/ })).toHaveLength(2));
      const post = fetch.mock.calls.find(([u, init]) => String(u) === "/api/wcx-releases" && init?.method === "POST")!;
      expect(JSON.parse(String(post[1]!.body))).toEqual({ tmdbId: "movie:949", releases: ["a", "b"] });
    });

    it("says when neither xREL nor WCX has anything", async () => {
      wcxApi([], []);
      render(<TitleView tileKey="movie:949" />);
      expect(
        await screen.findByText("None of your favorite groups has released this, and WCX has nothing."),
      ).toBeInTheDocument();
    });
  });
});
