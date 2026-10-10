// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { REQUESTS_CHANGED } from "@/lib/api-client";
import type { RequestItem } from "@/lib/api-types";
import { dismissToast, getToasts } from "@/lib/toast";
import { RequestAction, ResultTile, WishlistTile, useRequests, type Result } from "./request-tiles";

const heat: Result = {
  mediaType: "movie",
  tmdbId: 949,
  title: "Heat",
  year: 1995,
  posterPath: null,
  library: null,
  availability: null,
};
const ctx = (over: { pending?: Set<string> } = {}) => ({ pending: new Set<string>(), toggle: vi.fn(), ...over });

const request = (over: Partial<RequestItem> = {}): RequestItem => ({
  ...heat,
  releaseDate: "1995-12-15",
  requestedAt: "2026-09-01T00:00:00Z",
  mine: true,
  releaseGroups: [],
  ...over,
});

describe("RequestAction", () => {
  it("puts it on the wishlist with the corner heart", async () => {
    const c = ctx();
    render(<RequestAction item={heat} requested={false} ctx={c} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to wishlist" }));
    expect(c.toggle).toHaveBeenCalledWith(heat, false);
  });

  it("once on it, the same button is pressed and takes it off", async () => {
    const c = ctx();
    render(<RequestAction item={heat} requested ctx={c} />);
    const button = screen.getByRole("button", { name: "Remove from wishlist" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(c.toggle).toHaveBeenCalledWith(heat, true);
  });

  it("says In library once owned, and waits while pending", () => {
    const { rerender } = render(
      <RequestAction item={{ ...heat, library: { id: "j1" } }} requested={false} ctx={ctx()} />,
    );
    expect(screen.getByText("In library")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<RequestAction item={heat} requested={false} ctx={ctx({ pending: new Set(["movie:949"]) })} />);
    expect(screen.getByRole("button", { name: "Add to wishlist" })).toBeDisabled();
  });
});

describe("ResultTile", () => {
  it("links its poster to TMDB, or opens its releases for an admin", async () => {
    const { unmount } = render(<ResultTile item={heat} requested={false} ctx={ctx()} />);
    expect(screen.getByRole("link", { name: /Heat/ })).toHaveAttribute("href", "https://www.themoviedb.org/movie/949");
    unmount();

    const showReleases = vi.fn();
    render(<ResultTile item={heat} requested={false} ctx={{ ...ctx(), showReleases }} />);
    await userEvent.click(screen.getByTitle("Heat"));
    expect(showReleases).toHaveBeenCalledWith(heat);
  });
});

describe("WishlistTile", () => {
  it("shows who released it and the next release date, no state badge; the heart takes it off", async () => {
    const c = ctx();
    render(
      <WishlistTile
        item={request({
          releaseGroups: ["FuN", "VECTOR"],
          availability: { status: "cinema", next: { kind: "Digital", date: "2027-02-03" } },
        })}
        ctx={c}
      />,
    );
    expect(screen.queryByText("In cinemas")).toBeNull();
    expect(screen.getByText("FuN +1")).toHaveAttribute("title", "Released by FuN, VECTOR");
    expect(screen.getByText("1995 · Digital 3 Feb 2027")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove from wishlist" }));
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), true, false);
  });

  it("says In library once it's arrived", () => {
    render(
      <WishlistTile
        item={request({
          library: { id: "j1" },
          releaseGroups: ["FuN"],
          availability: { status: "digital", next: null },
        })}
        ctx={ctx()}
      />,
    );
    expect(screen.getByText("In library")).toBeInTheDocument();
    expect(screen.queryByText("Digital only")).toBeNull();
    expect(screen.queryByText("FuN")).toBeNull();
  });

  it("says who asked in an admin's overview, and removes it for all of them", async () => {
    const c = ctx();
    const requesters = [
      { name: "Anna", requestedAt: "2026-09-01T00:00:00Z" },
      { name: "Ben", requestedAt: "2026-09-02T00:00:00Z" },
    ];
    render(<WishlistTile item={request({ mine: false, requesters })} ctx={c} />);
    expect(screen.getByText("1995 · Anna, Ben")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove for everyone" }));
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), true, true);
  });
});

// /api/requests as one user's list, changed by POST and DELETE.
function requestsApi() {
  let items: RequestItem[] = [];
  return mockFetch((url, init) => {
    if (url.pathname !== "/api/requests") return;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (init?.method === "POST") items = [request(body)];
    if (init?.method === "DELETE") items = [];
    return json({ Items: items, all: false, admin: false });
  });
}

// What a page does with useRequests: a Wishlist button for Heat.
function Harness({ everyone = false }: { everyone?: boolean }) {
  const r = useRequests();
  const on = r.requestedKeys.has("movie:949");
  return (
    <button type="button" onClick={() => r.toggle(heat, on, everyone)}>
      {on ? "On" : "Off"}
    </button>
  );
}

describe("useRequests", () => {
  afterEach(() => {
    act(() => {
      for (const t of getToasts()) dismissToast(t.id);
    });
  });

  it("notes an add with a way to the list, and tells the sidebar", async () => {
    requestsApi();
    const changed = vi.fn();
    window.addEventListener(REQUESTS_CHANGED, changed);
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    expect(await screen.findByRole("button", { name: "On" })).toBeInTheDocument();
    expect(getToasts()).toMatchObject([
      {
        title: "Added to your wishlist",
        description: "Heat (1995)",
        tone: "success",
        action: { label: "View", href: "/wishlist" },
      },
    ]);
    expect(changed).toHaveBeenCalledOnce();
    window.removeEventListener(REQUESTS_CHANGED, changed);
  });

  it("notes a removal with Undo, which puts it back", async () => {
    requestsApi();
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    expect(await screen.findByRole("button", { name: "Off" })).toBeInTheDocument();
    const removed = getToasts().at(-1)!;
    expect(removed).toMatchObject({ title: "Removed from your wishlist", tone: "removed", action: { label: "Undo" } });
    await act(async () => removed.action!.onClick!());
    expect(await screen.findByRole("button", { name: "On" })).toBeInTheDocument();
  });

  it("has no Undo for a removal for everyone", async () => {
    requestsApi();
    render(<Harness everyone />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    await screen.findByRole("button", { name: "Off" });
    expect(getToasts().at(-1)).toMatchObject({ title: "Removed for everyone", tone: "removed" });
    expect(getToasts().at(-1)!.action).toBeUndefined();
  });
});
