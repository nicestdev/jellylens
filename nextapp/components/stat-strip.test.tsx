// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import "@/test/dom";
import { StatStrip, columnsFor } from "./stat-strip";

describe("columnsFor", () => {
  it("fills as many columns as fit, but the rows evenly", () => {
    expect(columnsFor(4, 6)).toBe(4);
    expect(columnsFor(4, 3)).toBe(2);
    expect(columnsFor(4, 2)).toBe(2);
    expect(columnsFor(5, 4)).toBe(3);
    expect(columnsFor(6, 4)).toBe(3);
    expect(columnsFor(7, 6)).toBe(4);
    expect(columnsFor(7, 7)).toBe(7);
  });

  it("is a single column when nothing fits", () => {
    expect(columnsFor(4, 0)).toBe(1);
    expect(columnsFor(4, 1)).toBe(1);
  });
});

describe("StatStrip", () => {
  it("lets a single stat fill the width, on a phone and from sm up", () => {
    const { container } = render(<StatStrip stats={[{ label: "Free", value: "935.44 GB" }]} />);
    const strip = container.firstElementChild!;
    expect(strip).not.toHaveClass("grid");
    expect(strip.className).not.toMatch(/(^|\s)(sm:)?w-/);
    expect(strip).toHaveTextContent("Free");
    expect(strip).toHaveTextContent("935.44 GB");
  });
});
