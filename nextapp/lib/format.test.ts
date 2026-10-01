import { describe, expect, it } from "vitest";
import { formatDate, formatNumber, plural, relativeTime, seasonLabel } from "./format";

describe("plural", () => {
  it("adds s, or es after a hissing sound", () => {
    expect(plural(1, "show")).toBe("1 show");
    expect(plural(3, "show")).toBe("3 shows");
    expect(plural(0, "episode")).toBe("0 episodes");
    expect(plural(2, "mismatch")).toBe("2 mismatches");
    expect(plural(2, "box")).toBe("2 boxes");
  });

  it("formats the number German-style", () => {
    expect(plural(11281, "title")).toBe("11.281 titles");
  });
});

describe("formatNumber and formatDate", () => {
  it("use German separators", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
    expect(formatDate(Date.UTC(2026, 8, 30, 12) / 1000)).toBe("30.09.2026");
  });
});

describe("relativeTime", () => {
  const now = Date.UTC(2026, 9, 1, 12);
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it("rounds to the largest fitting unit", () => {
    expect(relativeTime(null, now)).toBe("never");
    expect(relativeTime(ago(20_000), now)).toBe("just now");
    expect(relativeTime(ago(5 * 60_000), now)).toBe("5m ago");
    expect(relativeTime(ago(3 * 3600_000), now)).toBe("3h ago");
    expect(relativeTime(ago(49 * 3600_000), now)).toBe("2d ago");
  });
});

describe("seasonLabel", () => {
  it("calls season 0 Specials", () => {
    expect(seasonLabel(0)).toBe("Specials");
    expect(seasonLabel(4)).toBe("Season 4");
  });
});
