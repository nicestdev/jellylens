import { describe, expect, it } from "vitest";
import {
  episodeCode,
  formatBytes,
  formatDate,
  formatNumber,
  plural,
  relativeTime,
  resolutionLabel,
  seasonCode,
  seasonLabel,
} from "./format";

describe("plural", () => {
  it("adds s, or es after a hissing sound", () => {
    expect(plural(1, "show")).toBe("1 show");
    expect(plural(3, "show")).toBe("3 shows");
    expect(plural(0, "episode")).toBe("0 episodes");
    expect(plural(2, "mismatch")).toBe("2 mismatches");
    expect(plural(2, "box")).toBe("2 boxes");
  });

  it("writes the number without thousands separators", () => {
    expect(plural(11281, "title")).toBe("11281 titles");
  });
});

describe("formatNumber and formatDate", () => {
  it("have a decimal point and no thousands separators", () => {
    expect(formatNumber(1234567)).toBe("1234567");
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

describe("formatBytes", () => {
  it("picks a binary unit, always with two decimals", () => {
    expect(formatBytes(0)).toBe("0\u202fB");
    expect(formatBytes(900)).toBe("900\u202fB");
    expect(formatBytes(512 * 1024 ** 2)).toBe("512.00\u202fMB");
    expect(formatBytes(45.6 * 1024 ** 3)).toBe("45.60\u202fGB");
    expect(formatBytes(1.234 * 1024 ** 4)).toBe("1.23\u202fTB");
    expect(formatBytes(1.999 * 1024 ** 3)).toBe("2.00\u202fGB");
  });

  it("takes the next unit from 1000 on, so it's never four digits", () => {
    expect(formatBytes(999 * 1024 ** 2)).toBe("999.00\u202fMB");
    expect(formatBytes(1010 * 1024 ** 2)).toBe("0.99\u202fGB");
    expect(formatBytes(1000)).toBe("0.98\u202fKB");
  });
});

describe("resolutionLabel", () => {
  it("goes by width or height, so cropped films still count", () => {
    expect(resolutionLabel()).toBe("");
    expect(resolutionLabel(3840, 1600)).toBe("4K");
    expect(resolutionLabel(1920, 800)).toBe("1080p");
    expect(resolutionLabel(1280, 536)).toBe("720p");
    expect(resolutionLabel(720, 576)).toBe("SD");
  });
});

describe("episodeCode", () => {
  it("numbers an episode, a double one too", () => {
    expect(episodeCode(1, 2)).toBe("S01E02");
    expect(episodeCode(10, 101, 102)).toBe("S10E101-E102");
    expect(episodeCode(1, 2, 2)).toBe("S01E02");
    expect(episodeCode(null, 2)).toBe("");
  });
});

describe("seasonCode", () => {
  it("pads the season, and names a range by both ends", () => {
    expect(seasonCode(1)).toBe("S01");
    expect(seasonCode(12)).toBe("S12");
    expect(seasonCode(1, 1)).toBe("S01");
    expect(seasonCode(1, 3)).toBe("S01–S03");
  });
});
