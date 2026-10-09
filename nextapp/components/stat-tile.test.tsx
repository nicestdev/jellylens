// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import "@/test/dom";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("shows a number with its label and hint", () => {
    render(<StatTile label="Movies" value="649" hint="in the library" />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.getByText("649")).toBeInTheDocument();
    expect(screen.getByText("in the library")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("holds its place while loading", () => {
    render(<StatTile label="Movies" value="649" hint="in the library" loading />);
    expect(screen.getByText("Movies")).toBeInTheDocument();
    expect(screen.queryByText("649")).toBeNull();
    expect(screen.queryByText("in the library")).toBeNull();
  });
});
