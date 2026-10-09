// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { ReleaseGroupItem, ReleaseGroupsResponse } from "@/lib/api-types";
import { ReleaseGroups } from "./release-groups";

const group = (over: Partial<ReleaseGroupItem>): ReleaseGroupItem => ({
  id: "g1",
  kind: "p2p",
  name: "VECTOR",
  count: 1200,
  syncedAt: new Date().toISOString(),
  complete: true,
  syncing: false,
  ...over,
});

// POST and DELETE /api/release-groups; an unknown name gets xREL's 404.
function api(initial: ReleaseGroupItem[]) {
  let items = initial;
  return mockFetch((url, init) => {
    if (url.pathname !== "/api/release-groups") return;
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (init?.method === "POST") {
      if (body.name === "NOPE") return json({ error: "xREL doesn't list a scene group called NOPE." }, { status: 404 });
      items = [
        ...items,
        group({ id: "scene:" + body.name, kind: body.kind, name: body.name, count: 0, complete: false }),
      ];
    }
    if (init?.method === "DELETE") items = items.filter((g) => g.id !== body.id);
    return json({ Items: items, matching: false });
  });
}

// Like the page: holds what the last answer said.
function setup(items: ReleaseGroupItem[] | null, matching = false) {
  const onError = vi.fn();
  const onData = vi.fn();
  const data: ReleaseGroupsResponse | null = items && { Items: items, matching };
  const view = render(<ReleaseGroups data={data} onData={onData} onError={onError} />);
  onData.mockImplementation((next: ReleaseGroupsResponse) =>
    view.rerender(<ReleaseGroups data={next} onData={onData} onError={onError} />),
  );
  return { onError, onData, view };
}

const region = (name: string) => screen.getByRole("region", { name });

describe("ReleaseGroups", () => {
  it("lists the P2P and the scene groups apart, a table each", () => {
    setup([group({}), group({ id: "scene:WAYNE", kind: "scene", name: "WAYNE", count: 55 })]);
    const row = within(region("P2P groups")).getByText("VECTOR").closest("tr")!;
    expect(within(row).getByText("1.200")).toBeInTheDocument();
    expect(within(row).getByText("just now")).toBeInTheDocument();
    expect(within(region("Scene groups")).getByText("WAYNE")).toBeInTheDocument();
    expect(within(region("Scene groups")).queryByText("VECTOR")).toBeNull();
  });

  it("shows what a running sync is at", () => {
    const { view } = setup([group({ count: 100, syncing: true }), group({ id: "g2", name: "FuN", complete: false })]);
    expect(within(screen.getByText("100").closest("tr")!).getByText("syncing…")).toBeInTheDocument();
    expect(screen.getByText("waiting for the next sync")).toBeInTheDocument();
    view.rerender(<ReleaseGroups data={{ Items: [group({})], matching: true }} onData={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText("Checking release titles on TMDB…")).toBeInTheDocument();
  });

  it("waits for the first load, then adds from the table's last row", () => {
    const { view } = setup(null);
    expect(screen.queryByRole("table")).toBeNull();
    view.rerender(<ReleaseGroups data={{ Items: [], matching: false }} onData={vi.fn()} onError={vi.fn()} />);
    expect(within(region("Scene groups")).getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("adds a scene group from its own list", async () => {
    const fetch = api([]);
    const { onData } = setup([]);
    const scene = region("Scene groups");
    await userEvent.type(within(scene).getByRole("textbox", { name: "Add to Scene groups" }), " WAYNE ");
    await userEvent.click(within(scene).getByRole("button", { name: "Add" }));
    expect(await within(scene).findByText("WAYNE")).toBeInTheDocument();
    expect(within(scene).getByText("waiting for the next sync")).toBeInTheDocument();
    expect(within(scene).getByRole("textbox")).toHaveValue("");
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post![1]!.body))).toEqual({ name: "WAYNE", kind: "scene" });
    expect(onData).toHaveBeenCalledOnce();
  });

  it("says why a group couldn't be added, and keeps the name to fix", async () => {
    api([]);
    const { onError, onData } = setup([]);
    const scene = region("Scene groups");
    await userEvent.type(within(scene).getByRole("textbox"), "NOPE");
    await userEvent.click(within(scene).getByRole("button", { name: "Add" }));
    await vi.waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith("Couldn't add NOPE: xREL doesn't list a scene group called NOPE."),
    );
    expect(within(scene).getByRole("textbox")).toHaveValue("NOPE");
    expect(onData).not.toHaveBeenCalled();
  });

  it("removes a group from its menu", async () => {
    api([group({})]);
    setup([group({})]);
    await userEvent.click(screen.getByRole("button", { name: "More options for VECTOR" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove VECTOR" }));
    await vi.waitFor(() => expect(screen.queryByText("VECTOR")).toBeNull());
  });
});
