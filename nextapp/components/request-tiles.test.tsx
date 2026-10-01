// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import type { RequestItem } from "@/lib/api-types";
import { RequestAction, RequestTile, type Result } from "./request-tiles";

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
  it("has a badge for each group that released it", () => {
    render(<RequestTile item={request({ releaseGroups: ["FuN", "VECTOR"] })} ctx={ctx()} />);
    expect(screen.getByText("FuN")).toHaveAttribute("title", "Released by FuN");
    expect(screen.getByText("VECTOR")).toBeInTheDocument();
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
