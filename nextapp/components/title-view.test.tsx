// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { RELEASES_CHANGED } from "@/lib/api-client";
import type { MatchInfo, ReleaseDetail, ReleaseDetailTitle, ReleaseHead, WcxRelease } from "@/lib/api-types";
import { dismissToast, getToasts } from "@/lib/toast";
import { titlePath } from "@/lib/title-path";
import { Toaster } from "./toaster";
import { TitleView } from "./title-view";

const router = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn() };
// What the page's URL has after the "?" (an Upgrades link's ?group=…).
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => {
  search = "";
  Object.values(router).forEach((f) => f.mockReset());
  // The Quality menu remembers its pick in this browser: start each test on the default.
  localStorage.setItem("jellylens.title.quality", "1080p");
});

afterEach(() => {
  act(() => {
    for (const t of getToasts()) dismissToast(t.id);
  });
});

const heat = { title: "Heat", year: 1995, posterPath: "/heat.jpg", mediaType: "movie" as const, tmdbId: 949 };
const head: ReleaseHead = { ...heat, library: null, copies: [] };

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
  Items: names.map((name, i) => ({
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
const meta = () => screen.getByRole("heading", { level: 1 }).parentElement!.nextElementSibling!;
// How many releases the table lists (none: no table at all).
const shownCount = () => document.querySelectorAll("tbody tr").length;
// A release name's link: its name may wrap after its dots (<wbr>), which
// the test DOM reads as spaces.
const release = (re: RegExp) => (name: string) => re.test(name.replace(/ /g, ""));
// The table row a release's name is in.
const row = (name: RegExp) => screen.getByRole("link", { name: release(name) }).closest("tr")!;

// Picks a quality from the Quality menu.
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
    expect(screen.getByRole("heading", { level: 1, name: "Heat" })).toBeInTheDocument();
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
    const name = screen.getByRole("heading", { level: 1 }).parentElement!;
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

  it("lists only the releases an Upgrades link asks for, saying which", async () => {
    const fun = {
      ...bluray,
      Items: [
        ...bluray.Items,
        { ...bluray.Items[0], id: "fun", name: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-FuN", group: "FuN" },
        { ...bluray.Items[0], id: "fun264", name: "Heat.1995.German.DL.2160p.UHD.BluRay.x264-FuN", group: "FuN" },
      ],
    };
    search = titlePath("movie:949", { group: "FuN", tier: "2160p", codec: "x265" }).split("?")[1];
    api({ key: "movie:949", head, titles: [fun, rip] });
    render(<TitleView tileKey="movie:949" />);

    expect(await screen.findByText(/x265-FuN/)).toBeInTheDocument();
    expect(screen.getByText("Only FuN's 2160p x265 releases")).toBeInTheDocument();
    // The VECTOR releases, the x264 one, and the title with none left are gone.
    expect(meta()).toHaveTextContent("1995·Movie·1 release");
    expect(screen.queryByText(/x265-VECTOR/)).not.toBeInTheDocument();
    expect(screen.queryByText(/x264-FuN/)).not.toBeInTheDocument();
    expect(screen.queryByText(/HDRip/)).not.toBeInTheDocument();
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
    expect(meta()).toHaveTextContent(/^1995·Movie$/);
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

    // 1080p to start with.
    await waitFor(() => expect(shownCount()).toBe(2));
    expect(meta()).toHaveTextContent("2011·Show·3 releases");
    expect(screen.getByRole("button", { name: /^Quality/ })).toHaveTextContent("Quality: 1080p");
    await userEvent.click(screen.getByRole("button", { name: /^Quality/ }));
    expect(screen.getAllByRole("menuitemcheckbox").map((i) => i.textContent)).toEqual(["4K", "1080p", "All"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/x265-PL3X/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Season" }));
    await userEvent.click(await screen.findByRole("menuitemcheckbox", { name: "S02" }));
    await userEvent.keyboard("{Escape}");
    expect(shownCount()).toBe(1);
    expect(screen.getByText(/x264-JaJunge/)).toBeInTheDocument();

    // 4K has no S02: nothing left, until the season's chip is removed.
    await pickQuality("4K");
    expect(shownCount()).toBe(0);
    expect(screen.getByText(/No releases match/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "S02" }));
    expect(shownCount()).toBe(1);
    expect(screen.getByText(/x265-PL3X/)).toBeInTheDocument();

    await pickQuality("All");
    expect(shownCount()).toBe(3);
  });

  it("keeps a title and its menu when the Quality menu leaves nothing of it", async () => {
    api({
      key: "movie:949",
      head,
      titles: [bluray, { ...rip, Items: rip.Items.map((r) => ({ ...r, quality: "XviD" })) }],
    });
    render(<TitleView tileKey="movie:949" />);
    // No 1080p here: All.
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

    // The title's releases, its WCX page and what's on it; POSTs add.
    function wcxApi(list = releases, titles = [bluray]) {
      return mockFetch((url, init) => {
        if (url.pathname === "/api/wcx-search") return json({ url: "https://wcx.example/detail/abc" });
        if (url.pathname === "/api/wcx-releases" && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          return json({ packageId: 1, name: "Heat", hoster: body.hoster });
        }
        if (url.pathname === "/api/wcx-releases") return json({ releases: list });
        if (url.pathname === "/api/releases/movie%3A949") return json({ key: "movie:949", head, titles });
      });
    }

    it("lists WCX's releases with xREL's, under the same Quality menu, and adds one from the mirror picked", async () => {
      const fetch = wcxApi();
      render(
        <>
          <TitleView tileKey="movie:949" />
          <Toaster />
        </>,
      );
      // 1080p: only WAYNE's, and none of xREL's.
      expect(await screen.findByText(/x264-WAYNE/)).toBeInTheDocument();
      expect(shownCount()).toBe(1);
      expect(meta()).toHaveTextContent("1995·Movie·3 releases");
      expect(screen.queryByText(/x265-VECTOR/)).not.toBeInTheDocument();
      expect(screen.queryByText(/No releases match/)).not.toBeInTheDocument();
      expect(screen.getByText("WAYNE · 1080p · x264 · DL")).toBeInTheDocument();
      // Its mirrors, a line per source.
      expect(within(row(/x264-WAYNE/)).getByText("wcx")).toBeInTheDocument();
      expect(screen.getByText("8,00 GB")).toBeInTheDocument();
      expect(screen.getByText("07.08.2026")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: release(/x264-WAYNE/) })).toHaveAttribute(
        "href",
        "https://wcx.example/detail/abc",
      );
      expect(screen.getByRole("link", { name: "WCX" })).toHaveAttribute("href", "https://wcx.example/detail/abc");
      expect(String(fetch.mock.calls.find(([u]) => String(u).startsWith("/api/wcx-search"))![0])).toBe(
        "/api/wcx-search?tmdbId=movie%3A949",
      );

      await pickQuality("All");
      expect(shownCount()).toBe(3);
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
      await pickQuality("1080p");

      // No account for rapidgator: it can't be picked.
      expect(screen.getByRole("button", { name: /from rapidgator\.net/ })).toBeDisabled();
      const dd = screen.getByRole("button", { name: /x264-WAYNE to Downloads from ddownload\.com/ });
      await userEvent.click(dd);
      expect(await screen.findByText("Added to Downloads")).toBeInTheDocument();
      // Once added, it can't be added again.
      expect(dd).toBeDisabled();
      const post = fetch.mock.calls.find(([u, init]) => String(u) === "/api/wcx-releases" && init?.method === "POST")!;
      expect(JSON.parse(String(post[1]!.body))).toEqual({
        tmdbId: "movie:949",
        release: "fhd",
        hoster: "ddownload.com",
        source: "wcx",
      });
    });

    it("strikes a mirror whose links are gone and opens a filecrypt one's container", async () => {
      wcxApi();
      render(<TitleView tileKey="movie:949" />);
      await screen.findByText(/x264-WAYNE/);
      await pickQuality("4K");
      const uhd = row(/h265-iNNOVATiV/);
      expect(within(uhd).getByRole("button", { name: /ddownload\.com: the links are gone/ })).toBeDisabled();
      const filecrypt = within(uhd).getByRole("link", { name: /ddownload\.com on filecrypt/ });
      expect(filecrypt).toHaveAttribute("href", "https://filecrypt.example/0000000002");
      expect(filecrypt).toHaveTextContent("DD");
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

    it("gives a release both list one row, with the best of every WCX copy's mirrors", async () => {
      const name = bluray.Items[0].name;
      const mirror = {
        hoster: "ddownload.com",
        source: "wcx" as const,
        links: 2,
        route: "ddownload",
        offline: false,
        container: null,
      };
      wcxApi([
        wcxRelease({
          uid: "a",
          name: name.toLowerCase(),
          quality: "2160p",
          mirrors: [
            { ...mirror, hoster: "rapidgator.net", route: null },
            { ...mirror, offline: true },
          ],
        }),
        wcxRelease({ uid: "b", name, quality: "2160p", mirrors: [mirror] }),
      ]);
      render(<TitleView tileKey="movie:949" />);
      await vi.waitFor(() => expect(within(row(/x265-VECTOR/)).getByText("wcx")).toBeInTheDocument());
      expect(shownCount()).toBe(1);
      expect(meta()).toHaveTextContent("1995·Movie·1 release");
      const both = row(/x265-VECTOR/);
      // The name goes to xREL's page; the size, xREL has none of, is WCX's.
      expect(within(both).getByRole("link", { name: release(/x265-VECTOR/) })).toHaveAttribute(
        "href",
        "https://xrel.example/heat~19950",
      );
      expect(within(both).getByText("8,00 GB")).toBeInTheDocument();
      // DD (the live copy's; the dead one left out), then RG.
      expect(
        within(both)
          .getAllByRole("button")
          .map((b) => b.getAttribute("aria-label")),
      ).toEqual([
        `Add ${name} to Downloads from ddownload.com (wcx)`,
        `Add ${name.toLowerCase()} to Downloads from rapidgator.net (wcx)`,
      ]);
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
