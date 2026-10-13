// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { show } from "@/test/fixtures";
import { IgnoredShows } from "./ignored-shows";

const dark = { ...show({ id: "s1", name: "Dark", year: 2017 }), missingEpisodes: null };

describe("IgnoredShows", () => {
  it("lists what's ignored and unignores it from its ⋯", async () => {
    const fetch = mockFetch((url, init) => {
      if (url.pathname === "/api/shows") return json({ items: [dark] });
      if (url.pathname !== "/api/ignored") return undefined;
      if (init?.method === "DELETE") return json({ items: [] });
      return json({ items: [{ showId: "s1" }] });
    });
    render(<IgnoredShows onError={vi.fn()} />);
    expect(await screen.findByText("Dark")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "More options for Dark" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Unignore" }));
    expect(await screen.findByText("None yet")).toBeInTheDocument();
    const del = fetch.mock.calls.find(([, init]) => init?.method === "DELETE")!;
    expect(JSON.parse(String(del[1]!.body))).toEqual({ showId: "s1" });
  });
});
