// Jellyfin tags audio streams with ISO 639-2 codes, and both the
// bibliographic and terminology variants show up (ger/deu, fre/fra, …).
// Normalize them to one short code so each language is counted once.
const LANG_CODES: Record<string, string> = {
  eng: "EN", deu: "DE", ger: "DE", fre: "FR", fra: "FR", spa: "ES", ita: "IT",
  jpn: "JA", kor: "KO", chi: "ZH", zho: "ZH", rus: "RU", por: "PT", nld: "NL",
  dut: "NL", swe: "SV", dan: "DA", nor: "NO", fin: "FI", pol: "PL", tur: "TR",
  ara: "AR", hin: "HI", ces: "CS", cze: "CS", ell: "EL", gre: "EL", heb: "HE",
  hun: "HU", ron: "RO", rum: "RO", ukr: "UK",
};

// "ger" -> "DE"; unknown codes pass through upper-cased, "und" (undetermined)
// and empty tags return null.
export function normalizeLanguage(raw: string | undefined): string | null {
  const code = raw?.trim().toLowerCase();
  if (!code || code === "und") return null;
  return LANG_CODES[code] ?? code.toUpperCase();
}

// Unique normalized audio languages of an item's media streams, in order.
export function audioLanguages(streams: { Type?: string; Language?: string }[] | undefined): string[] {
  const seen = new Set<string>();
  for (const s of streams ?? []) {
    if (s.Type !== "Audio") continue;
    const code = normalizeLanguage(s.Language);
    if (code) seen.add(code);
  }
  return [...seen];
}

const languageNames = new Intl.DisplayNames(["en"], { type: "language" });

// "DE" -> "German"; falls back to the code for anything Intl doesn't know.
export function languageName(code: string): string {
  try {
    return languageNames.of(code.toLowerCase()) ?? code;
  } catch {
    return code;
  }
}
