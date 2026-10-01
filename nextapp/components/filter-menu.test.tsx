// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@/test/dom";
import { FilterChips, FilterMenu, type Facet } from "./filter-menu";

const facet = (over: Partial<Facet>): Facet => ({
  key: "genre",
  label: "Genre",
  values: ["Drama", "Crime"],
  selected: new Set(),
  onToggle: () => {},
  ...over,
});

describe("FilterMenu", () => {
  it("counts the values checked, and toggles one", async () => {
    const onToggle = vi.fn();
    render(<FilterMenu facets={[facet({ selected: new Set(["Drama"]), onToggle, counts: new Map([["Crime", 4]]) })]} />);
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveTextContent("1");
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    expect(screen.getByRole("menuitemcheckbox", { name: /Drama/ })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /Crime/ }));
    expect(onToggle).toHaveBeenCalledWith("Crime");
  });

  it("counts a single-choice section only while it's off its default", async () => {
    const onToggle = vi.fn();
    const target = (changed: boolean) =>
      facet({ key: "target", label: "Target", values: ["FuN", "VECTOR"], selected: new Set(["FuN"]), onToggle, single: true, changed });
    const { rerender } = render(<FilterMenu facets={[target(false)]} />);
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveTextContent(/^Filter$/);
    rerender(<FilterMenu facets={[target(true)]} />);
    expect(screen.getByRole("button", { name: /Filter/ })).toHaveTextContent("1");
    await userEvent.click(screen.getByRole("button", { name: /Filter/ }));
    await userEvent.click(screen.getByRole("menuitemcheckbox", { name: /VECTOR/ }));
    expect(onToggle).toHaveBeenCalledWith("VECTOR");
  });

  it("shows nothing without values", () => {
    const { container } = render(<FilterMenu facets={[facet({ values: [] })]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FilterChips", () => {
  it("removes one, or clears them all", async () => {
    const onRemove = vi.fn();
    const onClear = vi.fn();
    render(<FilterChips chips={[{ id: "a", label: "x265", onRemove }]} onClear={onClear} />);
    await userEvent.click(screen.getByRole("button", { name: "x265" }));
    await userEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onClear).toHaveBeenCalledOnce();
  });
});
