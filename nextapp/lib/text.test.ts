import { describe, expect, it } from "vitest";
import { fold, foldTitle, matchesWords } from "./text";

describe("fold", () => {
  it("lowercases and keeps words only, one space between", () => {
    expect(fold("Ein.Muenchner.im.Himmel")).toBe("ein muenchner im himmel");
    expect(fold("  The   Boys: S04 ")).toBe("the boys s04");
  });

  it("spells umlauts out, or drops their dots", () => {
    expect(fold("Münchner Straße Öl Ärger")).toBe("muenchner strasse oel aerger");
    expect(fold("Münchner Öl Ärger", false)).toBe("munchner ol arger");
  });

  it("drops other accents and apostrophes", () => {
    expect(fold("Amélie à l'école")).toBe("amelie a lecole");
    expect(fold("Carlito's Way")).toBe("carlitos way");
    expect(fold("Carlito’s Way")).toBe("carlitos way");
  });

  it("is empty for nothing but punctuation", () => {
    expect(fold("...!")).toBe("");
  });
});

describe("foldTitle", () => {
  it("has both spellings of the umlauts", () => {
    expect(foldTitle("Die Schöne")).toBe("die schoene die schone");
  });
});

describe("matchesWords", () => {
  it("finds every word of the query somewhere in the text, in any order", () => {
    const match = matchesWords("himmel münchner");
    expect(match("Ein.Muenchner.im.Himmel.2019")).toBe(true);
    expect(match("Himmel.2019")).toBe(false);
  });

  it("folds both sides the same way", () => {
    expect(matchesWords("CARLITO'S")("Carlitos.Way.1993")).toBe(true);
    expect(matchesWords("amelie")("Le fabuleux destin d'Amélie Poulain")).toBe(true);
  });

  it("matches parts of words", () => {
    expect(matchesWords("muen him")("Ein.Muenchner.im.Himmel")).toBe(true);
  });

  it("matches everything with an empty query", () => {
    expect(matchesWords("")("anything")).toBe(true);
    expect(matchesWords("  .. ")("")).toBe(true);
  });
});
