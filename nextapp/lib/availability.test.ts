import { describe, expect, it } from "vitest";
import { movieAvailability, showAvailability } from "./availability";

const today = "2026-06-15";
const yearAgo = "2025-06-15";
const releases = (theatrical: string | null, digital: string | null, physical: string | null) => ({
  theatrical,
  digital,
  physical,
});

describe("movieAvailability", () => {
  it("is fully out once on disc", () => {
    expect(
      movieAvailability(releases("2026-01-01", "2026-03-01", "2026-05-01"), "2026-01-01", today, yearAgo),
    ).toBeNull();
  });

  it("is digital only until the disc, with its date as next", () => {
    expect(movieAvailability(releases("2026-01-01", "2026-03-01", "2026-08-01"), "2026-01-01", today, yearAgo)).toEqual(
      {
        status: "digital",
        next: { kind: "Blu-ray", date: "2026-08-01" },
      },
    );
  });

  it("is in cinemas until it's out at home, with the earliest next date", () => {
    expect(movieAvailability(releases("2026-06-01", "2026-07-20", "2026-09-01"), "2026-06-01", today, yearAgo)).toEqual(
      {
        status: "cinema",
        next: { kind: "Digital", date: "2026-07-20" },
      },
    );
  });

  it("takes releases over a year old as fully out", () => {
    // TMDB often lacks digital/disc dates for older films.
    expect(movieAvailability(releases("2024-01-01", null, null), "2024-01-01", today, yearAgo)).toBeNull();
    expect(movieAvailability(releases(null, "2024-01-01", null), "2024-01-01", today, yearAgo)).toBeNull();
  });

  it("is upcoming before any release, with the first date as next", () => {
    expect(movieAvailability(releases("2026-12-01", "2027-02-01", null), "2026-12-01", today, yearAgo)).toEqual({
      status: "upcoming",
      next: { kind: "Cinema", date: "2026-12-01" },
    });
  });

  it("falls back to the plain release date without typed dates", () => {
    expect(movieAvailability(releases(null, null, null), "2026-01-01", today, yearAgo)).toBeNull();
    expect(movieAvailability(releases(null, null, null), "2026-09-01", today, yearAgo)).toEqual({
      status: "upcoming",
      next: { kind: "Out", date: "2026-09-01" },
    });
    expect(movieAvailability(releases(null, null, null), null, today, yearAgo)).toEqual({
      status: "upcoming",
      next: null,
    });
  });
});

describe("showAvailability", () => {
  it("is out once it premiered", () => {
    expect(showAvailability("2026-01-01", today)).toBeNull();
  });

  it("is upcoming before, with the premiere as next", () => {
    expect(showAvailability("2026-09-01", today)).toEqual({
      status: "upcoming",
      next: { kind: "Starts", date: "2026-09-01" },
    });
    expect(showAvailability(null, today)).toEqual({ status: "upcoming", next: null });
  });
});
