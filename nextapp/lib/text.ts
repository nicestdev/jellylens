// Lowercase words only, so "münchner himmel" finds
// Ein.Muenchner.im.Himmel…: umlauts spelled out, other accents dropped,
// apostrophes too ("Carlito's" -> "carlitos").
export function fold(s: string, umlauts = true): string {
  let out = s.toLowerCase().replace(/['’`]/g, "");
  if (umlauts) out = out.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  return out.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}

// A title, both ways of spelling its umlauts, for LIKE searches.
export const foldTitle = (title: string) => fold(title) + " " + fold(title, false);
