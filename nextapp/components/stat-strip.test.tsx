import { describe, expect, it } from "vitest";
import { columnsFor } from "./stat-strip";

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
