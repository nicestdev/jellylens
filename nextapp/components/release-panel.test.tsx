// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { MatchInfo, ReleaseDetail, ReleaseDetailTitle, ReleaseTitle } from "@/lib/api-types";
import { ReleasePanel } from "./release-panel";

const heat = { title: "Heat", year: 1995, posterPath: "/heat.jpg", mediaType: "movie" as const, tmdbId: 949 };

const tile: ReleaseTitle = {
  key: "movie:949",
  ...heat,
  type: "movie",
  releases: 2,
  qualities: ["HD-2160p"],
  groups: ["VECTOR"],
  latest: 300,
  sample: "Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR",
  library: null,
};

const match = (over: Partial<MatchInfo> = {}): MatchInfo => ({ status: "verified", shown: heat, verdict: null, candidate: null, ...over });

const title = (titleKey: string, label: string, names: string[], over: Partial<MatchInfo> = {}): ReleaseDetailTitle => ({
  titleKey,
  label,
  match: match(over),
  Items: names.map((name, i) => ({ id: titleKey + i, name, link: "https://www.xrel.to/" + i, quality: "HD-2160p", publishedAt: 1790000000, group: "VECTOR" })),
});

const bluray = title("heat~1995", "Heat (1995)", ["Heat.1995.German.DL.2160p.UHD.BluRay.x265-VECTOR"]);
const rip = title("heat", "Heat", ["Heat.German.AC3.HDRip.XViD-VECTOR"], { status: "searched" });

// Answers GET /api/releases/<key> with detail, POSTs with after(body).
function api(detail: ReleaseDetail, after?: (body: { titleKey: string; verdict: string | null }) => ReleaseDetail) {
  return mockFetch((url, init) => {
    if (url.pathname !== "/api/releases/" + encodeURIComponent(detail.key)) return undefined;
    if (init?.method === "POST") return json(after!(JSON.parse(String(init.body))));
    return json(detail);
  });
}

describe("ReleasePanel", () => {
  it("lists a single title's releases with its menu in the header", async () => {
    const fetch = api({ key: "movie:949", titles: [bluray] }, () => ({
      key: "heat~1995",
      titles: [{ ...bluray, match: match({ status: "rejected", verdict: "wrong", shown: { ...heat, posterPath: null, mediaType: null, tmdbId: null } }) }],
    }));
    const onChanged = vi.fn();
    render(<ReleasePanel title={tile} onClose={() => {}} onChanged={onChanged} />);

    expect(await screen.findByText(/Heat\.1995\.German\.DL\.2160p/)).toBeInTheDocument();
    expect(screen.getByText("1995 · 1 release")).toBeInTheDocument();
    expect(screen.queryByText(/Grouped from/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));

    expect(await screen.findByText("Marked as a wrong match by you.")).toBeInTheDocument();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(JSON.parse(String(post[1]!.body))).toEqual({ titleKey: "heat~1995", verdict: "wrong" });
    expect(onChanged).toHaveBeenCalledOnce();
  });

  it("gives every title on a merged tile its own section and menu", async () => {
    const fetch = api({ key: "movie:949", titles: [bluray, rip] }, ({ titleKey }) => ({
      key: "movie:949",
      titles: [titleKey === "heat" ? bluray : rip],
    }));
    render(<ReleasePanel title={tile} onClose={() => {}} onChanged={() => {}} />);

    expect(await screen.findByText("Grouped from 2 titles, each matched on its own.")).toBeInTheDocument();
    expect(screen.getByText("1995 · 2 releases")).toBeInTheDocument();
    const section = screen.getByText(/Found on TMDB by its release name/).closest("section")!;
    expect(within(section).getByText("Heat")).toBeInTheDocument();
    expect(within(section).getByText(/HDRip/)).toBeInTheDocument();

    await userEvent.click(within(section).getByRole("button", { name: "More options for Heat" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: /Wrong match/ }));

    // The rip left the tile; the BluRay stays, now on its own.
    expect(await screen.findByText("1995 · 1 release")).toBeInTheDocument();
    expect(screen.queryByText(/HDRip/)).not.toBeInTheDocument();
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST")!;
    expect(String(post[0])).toBe("/api/releases/movie%3A949");
    expect(JSON.parse(String(post[1]!.body))).toEqual({ titleKey: "heat", verdict: "wrong" });
  });

  it("opens on a request or collection movie, counting its releases once they're in", async () => {
    api({ key: "movie:949", titles: [bluray] });
    render(<ReleasePanel title={{ key: "movie:949", ...heat }} onClose={() => {}} onChanged={() => {}} />);
    expect(screen.getByText("1995")).toBeInTheDocument();
    expect(await screen.findByText("1995 · 1 release")).toBeInTheDocument();
    expect(screen.getByText(/Heat\.1995\.German\.DL\.2160p/)).toBeInTheDocument();
  });

  it("says when the releases can't be loaded", async () => {
    mockFetch(() => json({ error: "database is locked" }, { status: 500 }));
    render(<ReleasePanel title={tile} onClose={() => {}} onChanged={() => {}} />);
    expect(await screen.findByText("Failed to load releases: database is locked")).toBeInTheDocument();
  });
});
