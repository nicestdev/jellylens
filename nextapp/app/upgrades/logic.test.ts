import { describe, expect, it } from "vitest";
import type { Alternative, Unit } from "@/lib/api-types";
import {
  addsAudio,
  attributes,
  fileAudio,
  formatChange,
  fromFacet,
  panelFor,
  pickAlternative,
  searchRows,
  sortRows,
  startChoices,
  switchSummary,
  switchTiles,
  targetGroups,
  type SwitchOptions,
} from "./logic";

const GB = 1024 ** 3;

const alt = (over: Partial<Alternative> = {}): Alternative => ({
  group: "VECTOR",
  tier: "1080p",
  codec: "x264",
  name: "Heat.1995.German.DL.1080p.BluRay.x264-VECTOR",
  size: 9 * GB,
  audio: "DL",
  pack: false,
  episodes: 1,
  publishedAt: 100,
  ...over,
});

const unit = (over: Partial<Unit> = {}): Unit => ({
  key: "m1",
  parentId: "m1",
  title: "Heat",
  year: 1995,
  tmdbId: 949,
  imageTag: "tag",
  season: null,
  fileName: "Heat.1995.German.1080p.BluRay.x264-w00t.mkv",
  files: 1,
  size: 8 * GB,
  groups: [{ name: "w00t", files: 1 }],
  tier: "1080p",
  codec: "x264",
  languages: ["DE"],
  alternatives: [alt()],
  ...over,
});

const options = (over: Partial<SwitchOptions> = {}): SwitchOptions => ({
  target: "VECTOR",
  from: new Set(),
  quality: "same",
  codec: "any",
  onlyAudio: false,
  ...over,
});

describe("pickAlternative", () => {
  const remux = alt({ name: "Heat.1995.German.DL.1080p.BluRay.REMUX-VECTOR", publishedAt: 200, size: 30 * GB });
  const x265 = alt({ codec: "x265", name: "Heat.1995.German.DL.1080p.BluRay.x265-VECTOR", publishedAt: 300 });
  const uhd = alt({ tier: "2160p", codec: "x265", name: "Heat.1995.German.DL.2160p.UHD.x265-VECTOR" });
  const fun = alt({ group: "FuN", name: "Heat.1995.German.DL.1080p.BluRay.x264-FuN" });
  const u = unit({ alternatives: [alt(), remux, x265, uhd, fun] });

  it("takes the file's quality and codec first, then the newest, and counts the rest", () => {
    expect(pickAlternative(u, "vector", "same")).toEqual({ alt: remux, others: 2 });
    expect(pickAlternative(u, "VECTOR", "same", "x265")).toEqual({ alt: x265, others: 0 });
    expect(pickAlternative(u, "VECTOR", "2160p")).toEqual({ alt: uhd, others: 0 });
    expect(pickAlternative(u, "FuN", "same")).toEqual({ alt: fun, others: 0 });
    expect(pickAlternative(u, "ZeroTwo", "same")).toBeNull();
  });

  it("with any quality, takes the file's if there, else the best", () => {
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "any")).toEqual({ alt: uhd, others: 0 });
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "same")).toBeNull();
    // The codec narrows it before the quality is picked.
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "any", "x264")?.alt).toEqual(alt());
  });

  it("keeps to the file's codec with same as now", () => {
    expect(pickAlternative(unit({ codec: "x265", alternatives: [alt(), x265] }), "VECTOR", "same", "same")?.alt).toEqual(x265);
  });

  it("offers a season's pack before its episodes", () => {
    const pack = alt({ pack: true, publishedAt: 1, episodes: 10 });
    const episodes = alt({ episodes: 10, publishedAt: 999 });
    expect(pickAlternative(unit({ season: 1, alternatives: [episodes, pack] }), "VECTOR", "same")).toEqual({ alt: pack, others: 1 });
  });
});

describe("what changes", () => {
  it("reads a file's audio as a release would name it", () => {
    expect(fileAudio(unit())).toBeNull();
    expect(fileAudio(unit({ languages: ["DE", "EN"] }))).toBe("DL");
    expect(fileAudio(unit({ languages: ["DE", "EN", "FR"] }))).toBe("ML");
    expect(fileAudio(unit({ fileName: "Heat.1995.German.DL.1080p.BluRay.x264-w00t.mkv" }))).toBe("DL");
    expect(fileAudio(unit({ languages: ["EN", "FR"] }))).toBeNull();
  });

  it("lists group, quality, codec and audio, before and after", () => {
    expect(attributes(unit(), alt({ codec: "x265" }))).toEqual([
      { key: "group", before: "w00t", after: "VECTOR", same: false },
      { key: "quality", before: "1080p", after: "1080p", same: true },
      { key: "codec", before: "x264", after: "x265", same: false },
      { key: "audio", before: "DE", after: "DL", same: false },
    ]);
    const [, , , audio] = attributes(unit({ languages: [], groups: [{ name: null, files: 1 }] }), alt({ audio: null }));
    expect(audio).toEqual({ key: "audio", before: "?", after: "DE", same: false });
    expect(attributes(unit({ groups: [{ name: null, files: 1 }] }), alt())[0].before).toBe("n/a");
  });

  it("adds audio only to a file with one language", () => {
    expect(addsAudio(unit(), alt())).toBe(true);
    expect(addsAudio(unit({ languages: ["DE", "EN"] }), alt())).toBe(false);
    expect(addsAudio(unit(), alt({ audio: null }))).toBe(false);
  });

  it("writes the change with its sign", () => {
    expect(formatChange(1.1 * GB)).toBe("+1,10 GB");
    expect(formatChange(-512 * 1024 * 1024)).toBe("−512,00 MB");
    expect(formatChange(0)).toBe("±0 B");
    expect(formatChange(null)).toBe("?");
  });
});

describe("switchSummary", () => {
  const units = [
    unit(),
    unit({ key: "m2", title: "Alien", languages: ["DE", "EN"], size: 10 * GB, alternatives: [alt({ size: 7 * GB })] }),
    unit({ key: "m3", title: "Brazil", groups: [{ name: "FuN", files: 1 }], alternatives: [alt({ size: null })] }),
    unit({ key: "m4", title: "Dune", groups: [{ name: "VECTOR", files: 1 }] }),
    unit({ key: "m5", title: "Zelig", alternatives: [] }),
  ];

  it("lists what the target has of the files from other groups, and adds it up", () => {
    const s = switchSummary(units, options());
    expect(s.rows.map((r) => r.unit.key)).toEqual(["m1", "m2", "m3"]);
    expect(s).toMatchObject({
      considered: 4,
      audio: 2,
      added: 16 * GB,
      removed: 18 * GB,
      unknown: 1,
      shareNow: 0.2,
      shareAfter: 0.8,
    });
    expect(s.rows[0]).toMatchObject({ change: GB, addsAudio: true, others: 0 });
  });

  it("narrows it to some source groups, and to what adds audio", () => {
    expect(switchSummary(units, options({ from: new Set(["fun"]) })).rows.map((r) => r.unit.key)).toEqual(["m3"]);
    expect(switchSummary(units, options({ onlyAudio: true })).rows.map((r) => r.unit.key)).toEqual(["m1", "m3"]);
  });

  it("tells it in tiles, the storage tile red when it costs and green when it frees", () => {
    const tiles = switchTiles(switchSummary(units, options()), options(), "movies");
    expect(tiles).toEqual([
      { label: "VECTOR has", value: "3", hint: "of 4 movies from other groups", muted: false },
      { label: "Original audio", value: "2", hint: "German only now, DL or ML then", muted: false },
      { label: "Storage", value: "−2,00 GB", hint: "1 movie without a size", muted: false, tone: "good" },
      { label: "VECTOR's share", value: "20 % → 80 %", hint: "of the movie files" },
    ]);
    const costs = switchTiles(switchSummary([unit()], options()), options(), "shows");
    expect(costs[2]).toMatchObject({ value: "+1,00 GB", hint: "9,00 GB for 8,00 GB", tone: "bad" });
    expect(costs[3].hint).toBe("of the episode files");
    const none = switchTiles(switchSummary([unit({ alternatives: [] })], options()), options(), "movies");
    expect(none[0]).toMatchObject({ value: "0", muted: true });
    expect(none[2]).toMatchObject({ value: "–", muted: true, tone: undefined });
  });
});

describe("the list", () => {
  const rows = switchSummary(
    [
      unit({ key: "a", title: "Alien", size: 8 * GB, alternatives: [alt({ size: 6 * GB })] }),
      unit({ key: "b", title: "Brazil", size: 8 * GB, alternatives: [alt({ size: null })] }),
      unit({ key: "c", title: "Cube", size: 8 * GB, alternatives: [alt({ size: 12 * GB })] }),
    ],
    options()
  ).rows;
  const keys = (r: typeof rows) => r.map((x) => x.unit.key);

  it("sorts by title, change or size, those without a size last", () => {
    expect(keys(sortRows(rows, "title", "desc"))).toEqual(["c", "b", "a"]);
    expect(keys(sortRows(rows, "change", "asc"))).toEqual(["a", "c", "b"]);
    expect(keys(sortRows(rows, "size", "desc"))).toEqual(["c", "a", "b"]);
  });

  it("searches every word in the title", () => {
    expect(keys(searchRows(rows, "  ali "))).toEqual(["a"]);
    expect(keys(searchRows(rows, ""))).toEqual(["a", "b", "c"]);
  });
});

describe("the filter", () => {
  const groups = [
    { value: "w00t", files: 9, size: 0 },
    { value: null, files: 3, size: 0 },
    { value: "VECTOR", files: 5, size: 0 },
    { value: "FuN", files: 2, size: 0 },
  ];

  it("offers the library's groups but the target as sources, none named last", () => {
    const f = fromFacet({ groups }, "vector");
    expect(f.values).toEqual(["w00t", "fun", ""]);
    expect(f.counts.get("")).toBe(3);
    expect(f.names.get("")).toBe("n/a");
    expect(f.names.get("fun")).toBe("FuN");
  });

  it("lists the target groups A→Z and starts with what was picked last, if still there", () => {
    const targets = targetGroups(["VECTOR", "ZeroTwo", "FuN"]);
    expect(targets).toEqual(["FuN", "VECTOR", "ZeroTwo"]);
    expect(startChoices(targets, { target: "VECTOR", quality: "2160p", codec: "x265" })).toEqual({
      target: "VECTOR",
      quality: "2160p",
      codec: "x265",
    });
    expect(startChoices(targets, { target: "w00t", quality: "nonsense" })).toEqual({ target: "FuN", quality: "same", codec: "any" });
    expect(startChoices(targets, null)).toEqual({ target: "FuN", quality: "same", codec: "any" });
    expect(startChoices([], "garbage").target).toBe("");
  });
});

describe("panelFor", () => {
  const r = (name: string, group = "VECTOR", quality = "HD-1080p") => ({ name, group, quality });

  it("opens the title's panel on the target's releases in the picked quality and codec", () => {
    const p = panelFor(unit(), { target: "VECTOR", quality: "same", codec: "same" }, "movies");
    expect(p.title).toEqual({
      key: "movie:949",
      title: "Heat",
      year: 1995,
      posterPath: null,
      mediaType: "movie",
      tmdbId: 949,
      library: { id: "m1", imageTag: "tag" },
    });
    expect(p.only.note).toBe("Only VECTOR's 1080p x264 releases");
    expect(p.only.keep(r("Heat.1995.German.DL.1080p.BluRay.x264-VECTOR", "vector"))).toBe(true);
    expect(p.only.keep(r("Heat.1995.German.DL.1080p.BluRay.x264-FuN", "FuN"))).toBe(false);
    expect(p.only.keep(r("Heat.1995.German.DL.2160p.UHD.x264-VECTOR", "VECTOR", "HD-2160p"))).toBe(false);
    expect(p.only.keep(r("Heat.1995.German.DL.1080p.BluRay.x265-VECTOR"))).toBe(false);
  });

  it("with any quality and codec keeps them all; a season's only its own", () => {
    const p = panelFor(unit({ season: 2 }), { target: "ZeroTwo", quality: "any", codec: "any" }, "shows");
    expect(p.title).toMatchObject({ key: "tv:949", mediaType: "tv" });
    expect(p.only.note).toBe("Only ZeroTwo's releases of Season 2");
    expect(p.only.keep(r("Silo.2023.S02E01.German.DL.2160p.WEB.H265-ZeroTwo", "ZeroTwo", "HD-2160p"))).toBe(true);
    expect(p.only.keep(r("Silo.2023.S01.German.DL.1080p.WEB.H264-ZeroTwo", "ZeroTwo"))).toBe(false);
  });
});
