// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { wholeText } from "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { REQUESTS_CHANGED } from "@/lib/api-client";
import type { RequestItem } from "@/lib/api-types";
import { getToasts } from "@/lib/toast";
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
const ctx = (over: { pending?: Set<string>; admin?: boolean } = {}) => ({
  pending: new Set<string>(),
  admin: false,
  toggle: vi.fn(),
  ...over,
});

const request = (over: Partial<RequestItem> = {}): RequestItem => ({
  ...heat,
  releaseDate: "1995-12-15",
  requestedAt: "2026-09-01T00:00:00Z",
  mine: true,
  ...over,
});

describe("RequestAction", () => {
  it("puts it on the wishlist with the corner heart", async () => {
    const c = ctx();
    render(<RequestAction item={heat} requested={false} ctx={c} />);
    await userEvent.click(screen.getByRole("button", { name: "Add Heat to wishlist" }));
    expect(c.toggle).toHaveBeenCalledWith(heat, false);
  });

  it("once on it, the same button is pressed and takes it off", async () => {
    const c = ctx();
    render(<RequestAction item={heat} requested ctx={c} />);
    const button = screen.getByRole("button", { name: "Remove Heat from wishlist" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(c.toggle).toHaveBeenCalledWith(heat, true);
  });

  it("says In library once owned, and waits while pending", () => {
    const { rerender } = render(
      <RequestAction item={{ ...heat, library: { id: "j1" } }} requested={false} ctx={ctx()} />,
    );
    expect(screen.getByRole("img", { name: "In library" })).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<RequestAction item={heat} requested={false} ctx={ctx({ pending: new Set(["movie:949"]) })} />);
    expect(screen.getByRole("button", { name: "Add Heat to wishlist" })).toBeDisabled();
  });
});

describe("ResultTile", () => {
  it("links its poster to TMDB, or to its title page for an admin", () => {
    const { unmount } = render(<ResultTile item={heat} requested={false} ctx={ctx()} />);
    expect(screen.getByRole("link", { name: /Heat/ })).toHaveAttribute("href", "https://www.themoviedb.org/movie/949");
    unmount();

    render(<ResultTile item={heat} requested={false} ctx={ctx({ admin: true })} />);
    expect(screen.getByRole("link", { name: /Heat/ })).toHaveAttribute("href", "/title/movie/949");
  });
});

describe("WishlistTile", () => {
  it("shows the next release date, no state badge; the heart takes it off", async () => {
    const c = ctx();
    render(
      <WishlistTile
        item={request({
          availability: { status: "cinema", next: { kind: "Digital", date: "2027-02-03" } },
        })}
        ctx={c}
      />,
    );
    expect(screen.queryByText("In cinemas")).toBeNull();
    expect(screen.getByText(wholeText("1995 · Digital 3 Feb 2027"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Heat from wishlist" }));
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), true, false, true);
  });

  it("has no library mark, the library's titles being gone from the list", () => {
    render(<WishlistTile item={request({ library: { id: "j1" } })} ctx={ctx()} />);
    expect(screen.queryByRole("img", { name: "In library" })).toBeNull();
  });

  it("stays a moment with its heart empty once taken off, a click putting it back", async () => {
    const c = { ...ctx(), leaving: new Set(["movie:949"]) };
    render(<WishlistTile item={request()} ctx={c} />);
    const heart = screen.getByRole("button", { name: "Add Heat to wishlist" });
    expect(heart).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(heart);
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), false);
  });

  it("says who asked in an admin's overview, and removes it for all of them", async () => {
    const c = ctx();
    const requesters = [
      { name: "Anna", requestedAt: "2026-09-01T00:00:00Z" },
      { name: "Ben", requestedAt: "2026-09-02T00:00:00Z" },
    ];
    render(<WishlistTile item={request({ mine: false, requesters })} ctx={c} />);
    expect(screen.getByText(wholeText("1995 · Anna, Ben"))).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Remove Heat for everyone" }));
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), true, true, true);
  });
});

// /api/requests as one user's list, changed by POST and DELETE; bodies
// keeps what was sent.
function requestsApi() {
  let items: RequestItem[] = [];
  const bodies: Record<string, unknown>[] = [];
  mockFetch((url, init) => {
    if (url.pathname !== "/api/requests") return;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (body) bodies.push(body);
    if (init?.method === "POST") items = [request(body)];
    if (init?.method === "DELETE") items = [];
    return json({ items: items, all: false, admin: false });
  });
  return bodies;
}

// What a page does with useRequests: a Wishlist button for Heat, and what's
// listed (leaving: taken off a moment ago, still in sight).
function Harness({ everyone = false, linger = false }: { everyone?: boolean; linger?: boolean }) {
  const r = useRequests();
  const on = r.requestedKeys.has("movie:949");
  return (
    <>
      <button type="button" onClick={() => r.toggle(heat, on, everyone, linger)}>
        {on ? "On" : "Off"}
      </button>
      <p>
        {r.requests.map((i) => i.title).join(", ") || "Nothing"}
        {r.leaving.size ? " (leaving)" : ""}
      </p>
    </>
  );
}

describe("useRequests", () => {
  it("adds without a note, and tells the sidebar", async () => {
    requestsApi();
    const changed = vi.fn();
    window.addEventListener(REQUESTS_CHANGED, changed);
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    expect(await screen.findByRole("button", { name: "On" })).toBeInTheDocument();
    expect(screen.getByText("Heat")).toBeInTheDocument();
    expect(getToasts()).toEqual([]);
    expect(changed).toHaveBeenCalledOnce();
    window.removeEventListener(REQUESTS_CHANGED, changed);
  });

  it("keeps one taken off on the Wishlist in sight for a moment, then lets it go", async () => {
    requestsApi();
    render(<Harness linger />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    expect(await screen.findByRole("button", { name: "Off" })).toBeInTheDocument();
    expect(screen.getByText("Heat (leaving)")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Nothing")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("takes it off at once elsewhere", async () => {
    requestsApi();
    render(<Harness />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    await screen.findByRole("button", { name: "Off" });
    expect(screen.getByText("Nothing")).toBeInTheDocument();
  });

  it("asks to remove it for everyone in an admin's overview", async () => {
    const bodies = requestsApi();
    render(<Harness everyone />);
    await userEvent.click(await screen.findByRole("button", { name: "Off" }));
    await userEvent.click(await screen.findByRole("button", { name: "On" }));
    await screen.findByRole("button", { name: "Off" });
    expect(bodies.at(-1)).toMatchObject({ tmdbId: 949, everyone: true });
  });
});
