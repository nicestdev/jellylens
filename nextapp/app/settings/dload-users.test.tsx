// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import type { DloadUsersResponse } from "@/lib/api-types";
import { DloadUsers } from "./dload-users";

type User = DloadUsersResponse["items"][number];
const anna: User = { id: 1, name: "anna", group: "GRP", threads: 3290 };

// POST and DELETE /api/dload-users; anything but a profile's link gets a 400.
function api(initial: User[]) {
  let items = initial;
  return mockFetch((url, init) => {
    if (url.pathname !== "/api/dload-users") return;
    const body = JSON.parse(String(init?.body ?? "{}"));
    if (init?.method === "POST") {
      const m = /members\/([^/]+)\.(\d+)\/$/.exec(body.link);
      if (!m) return json({ error: "Paste their profile's link." }, { status: 400 });
      items = [...items, { id: Number(m[2]), name: m[1], group: m[1], threads: 0 }];
    }
    if (init?.method === "DELETE") items = items.filter((u) => u.id !== body.id);
    return json({ items });
  });
}

// Like the page: holds what the last answer said.
function setup(items: User[] | null) {
  const onError = vi.fn();
  const onData = vi.fn();
  const view = render(<DloadUsers data={items && { items }} onData={onData} onError={onError} />);
  onData.mockImplementation((next: DloadUsersResponse) =>
    view.rerender(<DloadUsers data={next} onData={onData} onError={onError} />),
  );
  return { onError, onData };
}

const region = () => screen.getByRole("region", { name: "DLoad uploaders" });

describe("DloadUsers", () => {
  it("lists each uploader with their threads and group", () => {
    setup([anna]);
    const row = within(region()).getByText("anna").closest("tr")!;
    expect(within(row).getByText("3290")).toBeInTheDocument();
    expect(within(row).getAllByText("GRP").length).toBeGreaterThan(0);
  });

  it("says when there are none, and adds one by their profile's link", async () => {
    const fetch = api([]);
    const { onData } = setup([]);
    expect(within(region()).getByText("None yet")).toBeInTheDocument();
    await userEvent.click(within(region()).getByRole("button", { name: "Add DLoad uploader" }));
    await userEvent.type(
      within(region()).getByRole("textbox", { name: "Add uploader by profile link" }),
      "https://dload.test/members/ben.77/{Enter}",
    );
    // Named, and of their own name as group until their threads are in.
    expect(await within(region()).findAllByText("ben")).not.toHaveLength(0);
    expect(within(region()).getByRole("textbox")).toHaveValue("");
    const post = fetch.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(post![1]!.body))).toEqual({ link: "https://dload.test/members/ben.77/" });
    expect(onData).toHaveBeenCalledOnce();
  });

  it("says why one couldn't be added, and keeps the link to fix", async () => {
    api([]);
    const { onError, onData } = setup([]);
    await userEvent.click(within(region()).getByRole("button", { name: "Add DLoad uploader" }));
    await userEvent.type(within(region()).getByRole("textbox"), "ben{Enter}");
    await vi.waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith("Couldn't add the uploader: Paste their profile's link."),
    );
    expect(within(region()).getByRole("textbox")).toHaveValue("ben");
    expect(onData).not.toHaveBeenCalled();
  });

  it("removes one from its menu", async () => {
    api([anna]);
    setup([anna]);
    await userEvent.click(screen.getByRole("button", { name: "More options for anna" }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Remove anna" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Sure? Click again" }));
    await vi.waitFor(() => expect(screen.queryByText("anna")).toBeNull());
  });
});
