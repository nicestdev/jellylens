// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("shows a number with its label and hint, and is no button without onClick", () => {
    render(<StatTile label="Movies" value="649" hint="in the library" />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("649")).toBeInTheDocument();
    expect(screen.getByText("in the library")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("picks what's shown below, pressed while it's the one shown", async () => {
    const onClick = vi.fn();
    const { rerender } = render(<StatTile label="Missing episodes" value="12" hint="episodes in 3 shows" onClick={onClick} />);
    const tile = screen.getByRole("button", { name: /Missing episodes/ });
    expect(tile).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(tile);
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<StatTile label="Missing episodes" value="12" hint="episodes in 3 shows" onClick={onClick} active />);
    expect(screen.getByRole("button", { name: /Missing episodes/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("holds its place while loading", () => {
    render(<StatTile label="Movies" value="649" hint="in the library" loading />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.queryByText("649")).toBeNull();
    expect(screen.queryByText("in the library")).toBeNull();
  });
});
