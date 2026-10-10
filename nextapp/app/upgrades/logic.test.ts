import { describe, expect, it } from "vitest";
import type { Alternative, Unit } from "@/lib/api-types";
import {
  addsAudio,
  attributes,
  fileAudio,
  formatChange,
  fromFacet,
  titleHref,
  pickAlternative,
  nameParts,
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
  posterPath: "/heat.jpg",
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

  it("takes the file's quality and codec first, then the newest", () => {
    expect(pickAlternative(u, "vector", "same")).toEqual(remux);
    expect(pickAlternative(u, "VECTOR", "same", "x265")).toEqual(x265);
    const av1 = alt({ group: "WOTT", codec: "AV1", name: "Heat.1995.German.DL.1080p.UHD.BDRip.AV1-WOTT" });
    expect(pickAlternative(unit({ alternatives: [alt({ group: "WOTT" }), av1] }), "WOTT", "same", "AV1")).toEqual(av1);
    expect(pickAlternative(u, "VECTOR", "2160p")).toEqual(uhd);
    expect(pickAlternative(u, "FuN", "same")).toEqual(fun);
    expect(pickAlternative(u, "ZeroTwo", "same")).toBeNull();
  });

  it("with any quality, takes the file's if there, else the best", () => {
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "any")).toEqual(uhd);
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "same")).toBeNull();
    // The codec narrows it before the quality is picked.
    expect(pickAlternative(unit({ tier: "720p", alternatives: [alt(), uhd] }), "VECTOR", "any", "x264")).toEqual(alt());
  });

  it("keeps to the file's codec with same as now", () => {
    expect(pickAlternative(unit({ codec: "x265", alternatives: [alt(), x265] }), "VECTOR", "same", "same")).toEqual(
      x265,
    );
  });

  it("offers a season's pack before its episodes", () => {
    const pack = alt({ pack: true, publishedAt: 1, episodes: 10 });
    const episodes = alt({ episodes: 10, publishedAt: 999 });
    expect(pickAlternative(unit({ season: 1, alternatives: [episodes, pack] }), "VECTOR", "same")).toEqual(pack);
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
    expect(formatChange(1.1 * GB)).toBe("+1.10\u202fGB");
    expect(formatChange(-512 * 1024 * 1024)).toBe("−512.00\u202fMB");
    expect(formatChange(0)).toBe("±0\u202fB");
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
    expect(s.rows[0]).toMatchObject({ change: GB, addsAudio: true });
    expect(s.rows[0]).not.toHaveProperty("others");
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
      { label: "Storage", value: "−2.00\u202fGB", hint: "1 movie without a size", muted: false },
      { label: "VECTOR's share", value: "80\u202f%", hint: "of the movie files, 20\u202f% now" },
    ]);
    const costs = switchTiles(switchSummary([unit()], options()), options(), "shows");
    expect(costs[2]).toMatchObject({ value: "+1.00\u202fGB", hint: "9.00\u202fGB for 8.00\u202fGB" });
    expect(costs[3]).toMatchObject({ hint: "of the episode files, 0\u202f% now" });
    const none = switchTiles(switchSummary([unit({ alternatives: [] })], options()), options(), "movies");
    expect(none[0]).toMatchObject({ value: "0", muted: true });
    expect(none[2]).toMatchObject({ value: "–", muted: true });
  });
});

describe("the list", () => {
  const rows = switchSummary(
    [
      unit({ key: "a", title: "Alien", size: 8 * GB, alternatives: [alt({ size: 6 * GB })] }),
      unit({ key: "b", title: "Brazil", size: 8 * GB, alternatives: [alt({ size: null })] }),
      unit({ key: "c", title: "Cube", size: 8 * GB, alternatives: [alt({ size: 12 * GB })] }),
    ],
    options(),
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
    expect(startChoices(targets, { target: "FuN", codec: "AV1" }).codec).toBe("AV1");
    expect(startChoices(targets, { target: "w00t", quality: "nonsense" })).toEqual({
      target: "FuN",
      quality: "same",
      codec: "any",
    });
    expect(startChoices(targets, null)).toEqual({ target: "FuN", quality: "same", codec: "any" });
    expect(startChoices([], "garbage").target).toBe("");
  });
});

describe("titleHref", () => {
  it("opens the title's page on the target's releases in the picked quality and codec", () => {
    expect(titleHref(unit(), { target: "VECTOR", quality: "same", codec: "same" }, "movies")).toBe(
      "/title/movie/949?group=VECTOR&tier=1080p&codec=x264",
    );
  });

  it("with any quality and codec leaves them out; a season's only its own", () => {
    expect(titleHref(unit({ season: 2 }), { target: "ZeroTwo", quality: "any", codec: "any" }, "shows")).toBe(
      "/title/tv/949?group=ZeroTwo&season=2",
    );
  });
});

describe("nameParts", () => {
  const name = "German.DL.1080p.BluRay.x265-VECTOR";
  const text = (parts: ReturnType<typeof nameParts>) => parts.map((p) => p.text).join("");

  it("marks what changes in the name, keeping all of it", () => {
    const parts = nameParts(name, attributes(unit(), alt({ codec: "x265", name })));
    expect(parts).toEqual([
      { text: "German." },
      { text: "DL", key: "audio" },
      { text: ".1080p.BluRay." },
      { text: "x265", key: "codec" },
      { text: "-" },
      { text: "VECTOR", key: "group" },
    ]);
    expect(text(parts)).toBe(name);
  });

  it("marks German when the original audio is lost, and nothing that stays or the name doesn't say", () => {
    const de = "German.1080p.BluRay.x264-VECTOR";
    expect(nameParts(de, attributes(unit({ languages: ["DE", "EN"] }), alt({ audio: null, name: de })))).toEqual([
      { text: "German", key: "audio" },
      { text: ".1080p.BluRay.x264-" },
      { text: "VECTOR", key: "group" },
    ]);
    expect(
      nameParts("German.BluRay-VECTOR", [{ key: "quality", before: "720p", after: "1080p", same: false }]),
    ).toEqual([{ text: "German.BluRay-VECTOR" }]);
    expect(nameParts(name, [])).toEqual([{ text: name }]);
  });
});
