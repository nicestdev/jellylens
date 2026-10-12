import { describe, expect, it } from "vitest";
import { languageName, normalizeLanguage } from "./languages";

describe("normalizeLanguage", () => {
  it("folds both ISO 639-2 variants into one code", () => {
    expect(normalizeLanguage("ger")).toBe("DE");
    expect(normalizeLanguage("deu")).toBe("DE");
    expect(normalizeLanguage(" ENG ")).toBe("EN");
  });

  it("passes unknown codes through, drops undetermined ones", () => {
    expect(normalizeLanguage("tlh")).toBe("TLH");
    expect(normalizeLanguage("und")).toBeNull();
    expect(normalizeLanguage("")).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });
});

describe("languageName", () => {
  it("names a code in English, or keeps the code", () => {
    expect(languageName("DE")).toBe("German");
    expect(languageName("not a code")).toBe("not a code");
  });
});
