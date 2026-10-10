// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { COUNTS_STALE, DOWNLOADS_CHANGED, REQUESTS_CHANGED } from "@/lib/api-client";
import type { DownloadsResponse, RequestItem, RequestsResponse, StatusResponse } from "@/lib/api-types";
import { MobileBar, Sidebar } from "./nav";

vi.mock("next/navigation", () => ({ usePathname: () => "/upgrades" }));

const admin = { id: "1", name: "Anna", admin: true };
const user = { id: "2", name: "Ben", admin: false };

const stage = { syncedAt: null, running: false, error: null };
const status: StatusResponse = {
  library: { ...stage, movies: 649, shows: 88 },
  tmdb: { ...stage, shows: 80, collections: 40 },
  missing: { ...stage, incompleteCount: 12, incompleteCollectionCount: 3, mismatchCount: 1 },
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
  releaseGroups: [],
  ...over,
});
// An admin's overview: two open (one someone else's), one arrived.
const requests: RequestsResponse = {
  Items: [request(1), request(2, { mine: false }), request(3, { library: { id: "j3" } })],
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
  it("lists the pages in Library, Explore and Administration for admins, with counts", async () => {
    serveStatus();
    render(<Sidebar user={admin} canSignOut={false} />);
    expect(screen.getByRole("link", { name: /^Jellylens/ })).toHaveAttribute("href", "/");
    // Sign out is there with sign-in off too, and does nothing.
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute("title", "Sign-in is off");
    expect(texts(sidebar().getAllByRole("link")).map((t) => t?.replace(/\d+$/, ""))).toEqual([
      "Movies",
      "TV Shows",
      "Discover",
      "Wishlist",
      "Analytics",
      "Downloads",
      "Missing",
      "Organize",
      "Releases",
      "Settings",
      "Upgrades",
    ]);
    expect(sidebar().getByText("Library")).toBeInTheDocument();
    expect(sidebar().getByText("Explore")).toBeInTheDocument();
    expect(sidebar().getByText("Administration")).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Upgrades" })).toHaveClass("text-foreground");
    expect(sidebar().getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    // Counts from /api/status; Missing adds up episodes' shows and collections.
    expect(await sidebar().findByRole("link", { name: "Movies 649" })).toBeInTheDocument();
    expect(sidebar().getByRole("link", { name: "Missing 15" })).toBeInTheDocument();
    expect(await sidebar().findByRole("link", { name: "Wishlist 2" })).toBeInTheDocument();
  });

  it("counts a user's own open requests, and follows changes to the list", async () => {
    serveStatus({ ...requests, all: false, admin: false });
    render(<Sidebar user={user} canSignOut />);
    expect(await sidebar().findByRole("link", { name: "Wishlist 1" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(
        new CustomEvent(REQUESTS_CHANGED, { detail: { Items: [request(1), request(4)], all: false, admin: false } }),
      );
    });
    expect(sidebar().getByRole("link", { name: "Wishlist 2" })).toBeInTheDocument();
  });

  it("counts the downloads that are new or running, and follows the Downloads page", async () => {
    const downloads = (statuses: string[]) =>
      ({ packages: statuses.map((status, id) => ({ id, status })) }) as unknown as DownloadsResponse;
    mockFetch((url) =>
      url.pathname === "/api/status"
        ? json(status)
        : url.pathname === "/api/requests"
          ? json(requests)
          : url.pathname === "/api/downloads"
            ? json(downloads(["pending", "downloading", "done"]))
            : undefined,
    );
    render(<Sidebar user={admin} canSignOut={false} />);
    expect(await sidebar().findByRole("link", { name: "Downloads 2" })).toBeInTheDocument();
    act(() => {
      window.dispatchEvent(new CustomEvent(DOWNLOADS_CHANGED, { detail: downloads(["done", "paused"]) }));
    });
    expect(sidebar().getByRole("link", { name: "Downloads 1" })).toBeInTheDocument();
  });

  it("counts the finished downloads not moved yet for Organize, and asks again when told", async () => {
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
    expect(await sidebar().findByRole("link", { name: "Organize 2" })).toBeInTheDocument();
    packages = packages.map((p) => ({ ...p, movedTo: p.movedTo ?? "nvme01/movies/x" }));
    act(() => {
      window.dispatchEvent(new Event(COUNTS_STALE));
    });
    expect(await sidebar().findByRole("link", { name: "Organize 0" })).toBeInTheDocument();
  });

  it("shows users only their pages, and Sign out with who's signed in", async () => {
    serveStatus();
    render(<Sidebar user={user} canSignOut />);
    expect(texts(sidebar().getAllByRole("link")).map((t) => t?.replace(/\d+$/, ""))).toEqual([
      "Movies",
      "TV Shows",
      "Discover",
      "Wishlist",
    ]);
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveAttribute("title", "Signed in as Ben");
    await sidebar().findByRole("link", { name: "Movies 649" });
  });
});

describe("MobileBar", () => {
  it("lists every page in one list", () => {
    render(<MobileBar user={admin} canSignOut={false} />);
    expect(texts(panel().getAllByRole("link", { hidden: true }))).toEqual([
      "Movies",
      "TV Shows",
      "Discover",
      "Wishlist",
      "Analytics",
      "Downloads",
      "Missing",
      "Organize",
      "Releases",
      "Settings",
      "Upgrades",
    ]);
  });

  it("shows users only their pages", () => {
    render(<MobileBar user={user} canSignOut />);
    expect(texts(panel().getAllByRole("link", { hidden: true }))).toEqual([
      "Movies",
      "TV Shows",
      "Discover",
      "Wishlist",
    ]);
  });
});
