// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { COUNTS_STALE, DOWNLOADS_CHANGED, REQUESTS_CHANGED } from "@/lib/api-client";
import type { DownloadsResponse, RequestItem, RequestsResponse, StatusResponse } from "@/lib/api-types";
import { PageTools } from "./page-tools";
import { MobileBar, Sidebar } from "./nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));

const admin = { id: "1", name: "Anna", admin: true };
const user = { id: "2", name: "Ben", admin: false };

const stage = { syncedAt: null, running: false, error: null };
const status: StatusResponse = {
  library: { ...stage, movies: 649, shows: 88 },
  tmdb: { ...stage, movies: 120, shows: 80 },
  missing: { ...stage, incompleteCount: 12 },
  releases: { ...stage, groups: 4, releases: 900 },
};
const request = (tmdbId: number, over: Partial<RequestItem> = {}): RequestItem => ({
  mediaType: "movie",
  tmdbId,
  title: `Movie ${tmdbId}`,
  year: 2024,
  releaseDate: null,
  posterPath: null,
  requestedAt: "2026-10-01T00:00:00Z",
  mine: true,
  library: null,
  availability: null,
  ...over,
});
// An admin's overview: two open (one someone else's), one arrived.
const requests: RequestsResponse = {
  items: [request(1), request(2, { mine: false }), request(3, { library: { id: "j3" } })],
  all: true,
  admin: true,
};
const serveStatus = (list = requests) =>
  mockFetch((url) =>
    url.pathname === "/api/status" ? json(status) : url.pathname === "/api/requests" ? json(list) : undefined,
  );

const sidebar = () => within(screen.getByRole("navigation", { name: "Main" }));
const panel = () => within(document.getElementById("mobile-menu")!);
const texts = (links: HTMLElement[]) => links.map((l) => l.textContent);

describe("Sidebar", () => {
  it("lists the Dashboard and Queue on top, then Library and Administration for admins, with counts", async () => {
    serveStatus();
    render(<Sidebar user={admin} canSignOut={false} />);
    expect(screen.getByRole("link", { name: /^Jellylens/ })).toHaveAttribute("href", "/dashboard");
    // Sign out is there with sign-in off too, and does nothing.
    expect(screen.getByRole("button", { name: "Sign out" })).not.toHaveAttribute("title");
    expect(texts(sidebar().getAllByRole("link")).map((t) => t?.replace(/\d+$/, ""))).toEqual([
      "Dashboard",
      "Queue",
      "Movies",
      "Shows",
      "Discover",
      "Wishlist",
      "Analytics",
      "Settings",
    ]);
    expect(sidebar().getByText("Library")).toBeInTheDocument();
    expect(sidebar().getByText("Administration")).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Settings" })).toHaveClass("text-foreground");
    expect(sidebar().getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    // Counts from /api/status.
    expect(await sidebar().findByRole("link", { name: "Movies 649" })).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Shows 88" })).toBeInTheDocument();
    expect(await sidebar().findByRole("link", { name: "Wishlist 2" })).toBeInTheDocument();
  });

  it("counts a user's own open requests, and follows changes to the list", async () => {
    serveStatus({ ...requests, all: false, admin: false });
    render(<Sidebar user={user} canSignOut />);
    expect(await sidebar().findByRole("link", { name: "Wishlist 1" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(REQUESTS_CHANGED, { detail: { items: [request(1), request(4)], all: false, admin: false } }),
      );
    });
    expect(sidebar().getByRole("link", { name: "Wishlist 2" })).toBeInTheDocument();
  });

  it("counts the packages not in the library yet for the Queue, and follows its page", async () => {
    const downloads = (packages: { status: string; movedTo: string | null }[]) =>
      ({ packages: packages.map((p, id) => ({ id, ...p })) }) as unknown as DownloadsResponse;
    mockFetch((url) =>
      url.pathname === "/api/status"
        ? json(status)
        : url.pathname === "/api/requests"
          ? json(requests)
          : url.pathname === "/api/downloads"
            ? json(
                downloads([
                  { status: "pending", movedTo: null },
                  { status: "downloading", movedTo: null },
                  { status: "done", movedTo: null },
                  { status: "done", movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]" },
                ]),
              )
            : undefined,
    );
    render(<Sidebar user={admin} canSignOut={false} />);
    expect(await sidebar().findByRole("link", { name: "Queue 3" })).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Queue 3" })).toHaveAttribute("href", "/queue");
    act(() => {
      window.dispatchEvent(
        new CustomEvent(DOWNLOADS_CHANGED, {
          detail: downloads([
            { status: "paused", movedTo: null },
            { status: "done", movedTo: "nvme01/movies/x" },
          ]),
        }),
      );
    });
    expect(sidebar().getByRole("link", { name: "Queue 1" })).toBeInTheDocument();
  });

  it("asks for the Queue's count again when told", async () => {
    let packages = [
      { id: 1, status: "done", movedTo: null },
      { id: 2, status: "done", movedTo: null },
      { id: 3, status: "done", movedTo: "nvme01/movies/Heat (1995) [tmdbid-949]" },
    ];
    mockFetch((url) =>
      url.pathname === "/api/status"
        ? json(status)
        : url.pathname === "/api/requests"
          ? json(requests)
          : url.pathname === "/api/downloads"
            ? json({ packages })
            : undefined,
    );
    render(<Sidebar user={admin} canSignOut={false} />);
    expect(await sidebar().findByRole("link", { name: "Queue 2" })).toBeInTheDocument();
    packages = packages.map((p) => ({ ...p, movedTo: p.movedTo ?? "nvme01/movies/x" }));
    act(() => {
      window.dispatchEvent(new Event(COUNTS_STALE));
    });
    expect(await sidebar().findByRole("link", { name: "Queue 0" })).toBeInTheDocument();
  });

  it("shows users only their pages, and Sign out", async () => {
    serveStatus();
    render(<Sidebar user={user} canSignOut />);
    expect(texts(sidebar().getAllByRole("link")).map((t) => t?.replace(/\d+$/, ""))).toEqual([
      "Movies",
      "Shows",
      "Discover",
      "Wishlist",
    ]);
    expect(screen.getByRole("link", { name: /^Jellylens/ })).toHaveAttribute("href", "/movies");
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
    await sidebar().findByRole("link", { name: "Movies 649" });
  });
});

describe("MobileBar", () => {
  it("lists every page in one list", () => {
    render(<MobileBar user={admin} canSignOut={false} />);
    expect(texts(panel().getAllByRole("link", { hidden: true }))).toEqual([
      "Dashboard",
      "Queue",
      "Movies",
      "Shows",
      "Discover",
      "Wishlist",
      "Analytics",
      "Settings",
    ]);
  });

  it("shows users only their pages", () => {
    render(<MobileBar user={user} canSignOut />);
    expect(texts(panel().getAllByRole("link", { hidden: true }))).toEqual(["Movies", "Shows", "Discover", "Wishlist"]);
  });

  it("names the page beside the logo, which goes to the user's start page", () => {
    render(<MobileBar user={admin} canSignOut={false} />);
    expect(screen.getByRole("link", { name: "Jellylens" })).toHaveAttribute("href", "/dashboard");
    expect(screen.getByRole("banner")).toHaveTextContent("Settings");
  });

  it("folds a page's tools down from its search button on a phone, a dot while they narrow the page", async () => {
    const matchMedia = vi
      .spyOn(window, "matchMedia")
      .mockImplementation(
        (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} }) as never,
      );
    try {
      const page = (active: boolean) => (
        <>
          <MobileBar user={admin} canSignOut={false} />
          <PageTools active={active}>
            <input aria-label="Search" />
          </PageTools>
        </>
      );
      const { rerender } = render(page(false));
      const button = await screen.findByRole("button", { name: "Search and filter" });
      expect(button.querySelector(".rounded-full")).toBeNull();
      const panel = document.getElementById("mobile-search")!;
      expect(within(panel).getByRole("textbox", { hidden: true })).toBeInTheDocument();
      fireEvent.click(button);
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(within(panel).getByRole("textbox", { name: "Search" })).toHaveFocus();
      rerender(page(true));
      expect(button.querySelector(".rounded-full")).not.toBeNull();
    } finally {
      matchMedia.mockRestore();
    }
  });
});
