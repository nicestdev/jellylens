import { describe, expect, it, vi } from "vitest";
import {
  decideMatch,
  displayTitle,
  fitsRelease,
  parseReleaseName,
  sameTitle,
  withUmlauts,
  type MatchEntry,
  type TitleLookup,
} from "./title-match";

const entry = (title: string, year: number | null, extra: Partial<MatchEntry> = {}): MatchEntry => ({
  mediaType: "movie",
  tmdbId: 1,
  title,
  originalTitle: title,
  year,
  posterPath: null,
  ...extra,
});

describe("parseReleaseName", () => {
  it.each([
    ["The.OutLaws.2023.German.AC3.DL.1080p.Web.x265-FuN", "The OutLaws", 2023],
    // A year in the title isn't the release year: the last one before the tags is.
    ["Blade.Runner.2049.2017.German.EAC3.DL.1080p.BluRay.x265-VECTOR", "Blade Runner 2049", 2017],
    ["Wonder.Woman.1984.2020.IMAX.German.EAC3.DL.1080p.BluRay.x265-VECTOR", "Wonder Woman 1984", 2020],
    ["Fear.Street.Teil.2.1978.2021.German.DL.EAC3.1080p.NF.WEB.H265-ZeroTwo", "Fear Street Teil 2 1978", 2021],
    ["1917.2019.German.DL.1080p.BluRay.x265-VECTOR", "1917", 2019],
    // Shows: the season ends the title.
    ["Silo.2023.S03E10.German.DL.Atmos.2160p.DV.HDR.ATVP.WEB.H265-ZeroTwo", "Silo", 2023],
    ["Weak.Hero.S02.German.Subbed.1080p.NF.WEB.H264-ZeroTwo", "Weak Hero", null],
    ["Faustrecht.German.AC3.HDRip.x264-FuN", "Faustrecht", null],
    ["Faustrecht.AV1-WOTT", "Faustrecht", null],
  ])("%s", (name, title, year) => {
    expect(parseReleaseName(name)).toEqual({ title, year });
  });

  it("doesn't take a future year as the release year", () => {
    const far = new Date().getFullYear() + 5;
    expect(parseReleaseName(`Movie.${far}.German.1080p-X`)).toEqual({ title: `Movie ${far}`, year: null });
  });
});

describe("sameTitle", () => {
  it.each([
    ["Carlitos Way", "Carlito's Way"],
    ["Frozen 2", "Frozen II"],
    ["The OutLaws", "The Out-Laws"],
    ["Ein Muenchner im Himmel", "Ein Münchner im Himmel"],
    // A subtitle on one side doesn't count against it.
    ["Nirvana", "Nirvana - Die Zukunft ist ein Spiel"],
  ])("%s ≈ %s", (a, b) => {
    expect(sameTitle(a, b)).toBe(true);
  });

  it.each([
    ["The OutLaws", "Amza, der Schrecken der Bojaren"],
    ["Monster Haustiere Ein Hotel Transsilvanien Kurzfilm", "Hotel Transsilvanien 4 - Eine Monster Verwandlung"],
    ["Frozen 2", "Die Eiskönigin 2"],
  ])("%s ≠ %s", (a, b) => {
    expect(sameTitle(a, b)).toBe(false);
  });
});

describe("fitsRelease", () => {
  const release = (name: string) => parseReleaseName(name);

  it("takes the original title too", () => {
    const frozen = entry("Die Eiskönigin 2", 2019, { originalTitle: "Frozen II" });
    expect(fitsRelease(release("Frozen.2.2019.German.DL.1080p-X"), frozen)).toBe(true);
  });

  it("allows a year apart, three with the very same title", () => {
    expect(fitsRelease(release("Tanz.der.Teufel.1981.German-X"), entry("Tanz der Teufel", 1983))).toBe(true);
    expect(fitsRelease(release("Tanz.der.Teufel.1981.German-X"), entry("Tanz der Teufel", 1985))).toBe(false);
    expect(fitsRelease(release("Nirvana.1997.German-X"), entry("Nirvana - Die Zukunft ist ein Spiel", 1998))).toBe(
      true,
    );
    expect(fitsRelease(release("Nirvana.1997.German-X"), entry("Nirvana - Die Zukunft ist ein Spiel", 1999))).toBe(
      false,
    );
  });

  it("rejects a remake of the same name", () => {
    expect(fitsRelease(release("Die.Bruecke.1959.German-X"), entry("Die Brücke", 2008))).toBe(false);
  });

  it("checks other titles only when given", () => {
    const weeks = entry("9½ Wochen", 1986, { originalTitle: "Nine 1/2 Weeks" });
    const name = release("Neuneinhalb.Wochen.1986.German.AC3.HDRip.x264-FuN");
    expect(fitsRelease(name, weeks)).toBe(false);
    expect(fitsRelease(name, weeks, ["Neuneinhalb Wochen"])).toBe(true);
  });

  it("goes by title alone when a year is missing", () => {
    expect(fitsRelease(release("Faustrecht.German-X"), entry("Faustrecht", 2003))).toBe(true);
  });
});

describe("helpers", () => {
  it("spells umlauts back in", () => {
    expect(withUmlauts("Die Bruecke der Aerzte")).toBe("Die Brücke der Ärzte");
  });

  it("keeps a readable fallback title", () => {
    expect(displayTitle(parseReleaseName("Monster.Haustiere.-.Ein.Hotel.2021.German-X"))).toBe(
      "Monster Haustiere - Ein Hotel",
    );
  });
});

describe("decideMatch", () => {
  const outlaws = "The.OutLaws.2023.German.AC3.DL.1080p.Web.x265-FuN";
  const amza = entry("Amza, der Schrecken der Bojaren", 1966, {
    tmdbId: 373995,
    originalTitle: "Haiducii lui Șaptecai",
  });
  const theOutLaws = entry("The Out-Laws", 2023, { tmdbId: 921636 });

  const lookup = (search: MatchEntry[] = [], otherTitles: string[] = []): TitleLookup => ({
    otherTitles: vi.fn(async () => otherTitles),
    search: vi.fn(async () => search),
  });

  it("takes xREL's link when it fits", async () => {
    const hit = entry("Die Eiskönigin 2", 2019, { originalTitle: "Frozen II" });
    const l = lookup();
    const d = await decideMatch(
      { type: "movie", names: ["Frozen.2.2019.German.DL-X"], candidate: hit, verdict: null },
      l,
    );
    expect(d).toMatchObject({ status: "verified", entry: hit });
    expect(l.search).not.toHaveBeenCalled();
  });

  it("verifies by TMDB's other titles before searching", async () => {
    const weeks = entry("9½ Wochen", 1986);
    const l = lookup([], ["Neuneinhalb Wochen"]);
    const d = await decideMatch(
      { type: "movie", names: ["Neuneinhalb.Wochen.1986.German-X"], candidate: weeks, verdict: null },
      l,
    );
    expect(d.status).toBe("verified");
    expect(l.search).not.toHaveBeenCalled();
  });

  it("replaces a wrong link with a search hit that fits", async () => {
    const l = lookup([entry("Something Else", 2023), theOutLaws]);
    const d = await decideMatch({ type: "movie", names: [outlaws], candidate: amza, verdict: null }, l);
    expect(d).toMatchObject({ status: "searched", entry: theOutLaws });
    expect(l.search).toHaveBeenCalledWith("movie", "The OutLaws", 2023);
  });

  it("shows nothing from TMDB when nothing fits", async () => {
    const d = await decideMatch({ type: "movie", names: [outlaws], candidate: amza, verdict: null }, lookup());
    expect(d).toEqual({ status: "unverified", entry: null, fallback: { title: "The OutLaws", year: 2023 } });
  });

  it("searches again with umlauts", async () => {
    const bruecke = entry("Die Brücke", 1959);
    const l: TitleLookup = {
      otherTitles: async () => [],
      search: vi.fn(async (_kind, query) => (query === "Die Brücke" ? [bruecke] : [])),
    };
    const d = await decideMatch(
      { type: "movie", names: ["Die.Bruecke.1959.German-X"], candidate: null, verdict: null },
      l,
    );
    expect(d).toMatchObject({ status: "searched", entry: bruecke });
  });

  it("without a year, takes a search hit only if it's the only one that fits", async () => {
    const title = { type: "movie", names: ["Faustrecht.German-X"], candidate: null, verdict: null };
    expect((await decideMatch(title, lookup([entry("Faustrecht", 2003)]))).status).toBe("searched");
    expect((await decideMatch(title, lookup([entry("Faustrecht", 2003), entry("Faustrecht", 1971)]))).status).toBe(
      "unverified",
    );
  });

  it("searches shows as shows", async () => {
    const l = lookup();
    await decideMatch({ type: "tv", names: ["Silo.2023.S03E10.German.DL-X"], candidate: null, verdict: null }, l);
    expect(l.search).toHaveBeenCalledWith("tv", "Silo", 2023);
  });

  it("follows a decision made by hand", async () => {
    const base = { type: "movie", names: [outlaws], candidate: amza };
    expect(await decideMatch({ ...base, verdict: "wrong" }, lookup([theOutLaws]))).toMatchObject({
      status: "rejected",
      entry: null,
    });
    expect(await decideMatch({ ...base, verdict: "xrel" }, lookup([theOutLaws]))).toMatchObject({
      status: "confirmed",
      entry: amza,
    });
  });

  it("without TMDB access, only xREL's link that fits counts", async () => {
    const d = await decideMatch({ type: "movie", names: [outlaws], candidate: amza, verdict: null }, null);
    expect(d.status).toBe("unverified");
  });
});
