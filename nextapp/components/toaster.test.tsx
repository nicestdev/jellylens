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
  it("shows the newest note last, its title over the description, read out politely", () => {
    render(<Toaster />);
    act(() => {
      toast("Added to your wishlist", { description: "Heat (1995)", tone: "success" });
      toast("Removed from your wishlist", { description: "Ronin (1998)", tone: "error" });
    });
    const notes = screen.getAllByRole("status");
    expect(notes.map((n) => n.textContent)).toEqual([
      expect.stringContaining("Added to your wishlistHeat (1995)"),
      expect.stringContaining("Removed from your wishlistRonin (1998)"),
    ]);
    expect(notes[0].parentElement).toHaveAttribute("aria-live", "polite");
  });

  it("sets a release name's description in Mono", () => {
    render(<Toaster />);
    act(() => {
      toast("Download started", { description: "Heat.1995.German.DL.1080p.BluRay.x264-GROUP", mono: true });
      toast("Not moved", { description: "Heat (1995): the library has it already" });
    });
    expect(screen.getByText("Heat.1995.German.DL.1080p.BluRay.x264-GROUP")).toHaveClass("font-mono");
    expect(screen.getByText("Heat (1995): the library has it already")).not.toHaveClass("font-mono");
  });

  it("leads to its action's link", () => {
    render(<Toaster />);
    act(() => {
      toast("Added to your wishlist", { tone: "success", action: { label: "View", href: "/wishlist" } });
    });
    expect(screen.getByRole("link", { name: "View" })).toHaveAttribute("href", "/wishlist");
  });

  it("has no ×, and colors a note waiting on a hand peach", () => {
    render(<Toaster />);
    act(() => {
      toast("Needs attention", { tone: "warning" });
    });
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByRole("status").firstElementChild).toHaveClass("bg-warning");
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

  it("stays 2 s, or 5 s with a link", () => {
    vi.useFakeTimers();
    render(<Toaster />);
    act(() => {
      toast("Ready to organize", { tone: "success" });
      toast("Download started", { tone: "success", action: { label: "View", href: "/queue" } });
    });
    act(() => vi.advanceTimersByTime(2500));
    expect(screen.queryByText("Ready to organize")).toBeNull();
    expect(screen.getByText("Download started")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByText("Download started")).toBeNull();
    vi.useRealTimers();
  });
});
