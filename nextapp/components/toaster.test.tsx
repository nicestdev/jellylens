// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { dismissToast, getToasts, toast } from "@/lib/toast";
import { Toaster } from "./toaster";

afterEach(() => {
  act(() => {
    for (const t of getToasts()) dismissToast(t.id);
  });
});

describe("Toaster", () => {
  it("shows the newest note first, its title over the description, read out politely", () => {
    render(<Toaster />);
    act(() => {
      toast("Added to your wishlist", { description: "Heat (1995)", tone: "success" });
      toast("Removed from your wishlist", { description: "Ronin (1998)", tone: "removed" });
    });
    const notes = screen.getAllByRole("status");
    expect(notes.map((n) => n.textContent)).toEqual([
      expect.stringContaining("Removed from your wishlistRonin (1998)"),
      expect.stringContaining("Added to your wishlistHeat (1995)"),
    ]);
    expect(notes[0].parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("runs a button action and closes; a link action leads there and closes", async () => {
    const undo = vi.fn();
    render(<Toaster />);
    act(() => {
      toast("Removed from your wishlist", { tone: "removed", action: { label: "Undo", onClick: undo } });
    });
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(undo).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).toBeNull();

    act(() => {
      toast("Added to your wishlist", { tone: "success", action: { label: "View", href: "/wishlist" } });
    });
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/wishlist");
  });

  it("closes with ×", async () => {
    render(<Toaster />);
    act(() => {
      toast("Saved");
    });
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("holds the countdown while hovered", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Toaster />);
    act(() => {
      toast("Added to your wishlist", { tone: "success" });
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await user.hover(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByRole("status")).toBeInTheDocument();
    await user.unhover(screen.getByRole("status"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole("status")).toBeNull();
    vi.useRealTimers();
  });
});
