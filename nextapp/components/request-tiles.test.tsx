// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { RequestItem } from "@/lib/api-types";
import { RequestAction, RequestTile, ResultTile, type Result } from "./request-tiles";

const heat: Result = { mediaType: "movie", tmdbId: 949, title: "Heat", year: 1995, posterPath: null, library: null, availability: null };
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
  it("requests with +", async () => {
    const c = ctx();
    render(<RequestAction item={heat} requested={false} ctx={c} />);
    await userEvent.click(screen.getByRole("button", { name: "Request" }));
    expect(c.toggle).toHaveBeenCalledWith(heat, false);
  });

  it("is a ✓ once requested, In library once owned, and waits while pending", () => {
    const { rerender } = render(<RequestAction item={heat} requested ctx={ctx()} />);
    expect(screen.getByLabelText("Requested")).not.toHaveRole("button");
    rerender(<RequestAction item={{ ...heat, library: { id: "j1", serverId: "s" } }} requested={false} ctx={ctx()} />);
    expect(screen.getByText("In library")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<RequestAction item={heat} requested={false} ctx={ctx({ pending: new Set(["movie:949"]) })} />);
    expect(screen.getByRole("button", { name: "Request" })).toBeDisabled();
  });
});

describe("RequestTile", () => {
  it("has one badge for the groups that released it", () => {
    render(<RequestTile item={request({ releaseGroups: ["FuN", "VECTOR"] })} ctx={ctx()} />);
    expect(screen.getByText("FuN +1")).toHaveAttribute("title", "Released by FuN, VECTOR");
  });

  it("links its poster to TMDB, or opens its releases for an admin", async () => {
    const { unmount } = render(<RequestTile item={request()} ctx={ctx()} />);
    expect(screen.getByRole("link", { name: /Heat/ })).toHaveAttribute("href", "https://www.themoviedb.org/movie/949");
    unmount();

    const showReleases = vi.fn();
    render(<RequestTile item={request({ releaseGroups: ["FuN"] })} ctx={{ ...ctx(), showReleases }} />);
    expect(screen.queryByRole("link", { name: /Heat/ })).toBeNull();
    await userEvent.click(screen.getByTitle("Heat"));
    expect(showReleases).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }));
  });

  it("counts who asked in an admin's overview, and removes it for all of them", async () => {
    const c = ctx();
    const requesters = [
      { name: "Anna", requestedAt: "2026-09-01T00:00:00Z" },
      { name: "Ben", requestedAt: "2026-09-02T00:00:00Z" },
    ];
    render(<RequestTile item={request({ mine: false, requesters })} ctx={c} />);
    expect(screen.getByText("2 requests")).toHaveAttribute("title", "Anna, Ben");
    await userEvent.click(screen.getByRole("button", { name: "Remove for everyone" }));
    expect(c.toggle).toHaveBeenCalledWith(expect.objectContaining({ tmdbId: 949 }), true, true);
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
