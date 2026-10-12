// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { FacetMenu, FilterChips, type Facet } from "./filter-menu";

const facet = (over: Partial<Facet>): Facet => ({
  key: "genre",
  label: "Genre",
  values: ["Drama", "Crime"],
  selected: new Set(),
  onToggle: () => {},
  ...over,
});

describe("FacetMenu", () => {
  it("is named after its facet and its pick, and toggles one", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FacetMenu facet={facet({ selected: new Set() })} />);
    expect(screen.getByRole("button", { name: "Genre: All" })).toBeInTheDocument();
    rerender(<FacetMenu facet={facet({ selected: new Set(["Drama", "Crime"]) })} />);
    expect(screen.getByRole("button", { name: "Genre: Drama +1" })).toBeInTheDocument();
    rerender(<FacetMenu facet={facet({ selected: new Set(["Drama"]), onToggle, counts: new Map([["Crime", 4]]) })} />);
    const button = screen.getByRole("button", { name: "Genre: Drama" });
    await userEvent.click(button);
    expect(screen.getByRole("menuitemcheckbox", { name: /Drama/ })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("menuitemcheckbox", { name: /Crime/ })).toHaveTextContent("4");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Crime/ }));
    expect(onToggle).toHaveBeenCalledWith("Crime");
  });

  it("names a single-choice facet's pick, and toggles another", async () => {
    const onToggle = vi.fn();
    render(
      <FacetMenu
        facet={facet({
          key: "target",
          label: "Target",
          values: ["FuN", "VECTOR"],
          selected: new Set(["FuN"]),
          onToggle,
          single: true,
        })}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Target: FuN" }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /VECTOR/ }));
    expect(onToggle).toHaveBeenCalledWith("VECTOR");
  });

  it("shows nothing without values", () => {
    const { container } = render(<FacetMenu facet={facet({ values: [] })} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FilterChips", () => {
  it("removes one, or clears them all", async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(<FilterChips chips={[{ id: "a", label: "x265", onRemove }]} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove x265" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });
});
