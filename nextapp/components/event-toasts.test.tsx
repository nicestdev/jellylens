// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import "@/test/dom";
import { json, mockFetch } from "@/test/http";
import { COUNTS_STALE } from "@/lib/api-client";
import { dismissToast, getToasts } from "@/lib/toast";
import { EventToasts } from "./event-toasts";

afterEach(() => {
  act(() => {
    for (const t of getToasts()) dismissToast(t.id);
  });
  vi.useRealTimers();
});

describe("EventToasts", () => {
  it("shows what happens after the page opened as notes, and has the sidebar count again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetch = mockFetch((url) =>
      url.searchParams.get("after") === null
        ? json({ last: 3, events: [] })
        : url.searchParams.get("after") === "3"
          ? json({ last: 4, events: [{ id: 4, title: "Downloaded", description: "Heat (1995)", tone: "success" }] })
          : json({ last: 4, events: [] }),
    );
    const stale = vi.fn();
    window.addEventListener(COUNTS_STALE, stale);
    render(<EventToasts />);
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(fetch).toHaveBeenCalledWith("/api/events?after=3", undefined);
    expect(getToasts()).toEqual([
      expect.objectContaining({ title: "Downloaded", description: "Heat (1995)", tone: "success" }),
    ]);
    expect(stale).toHaveBeenCalledOnce();
    // Nothing new: no note, no recount.
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(stale).toHaveBeenCalledOnce();
    window.removeEventListener(COUNTS_STALE, stale);
  });
});
