// Lowercase words only, so "münchner himmel" finds
// Ein.Muenchner.im.Himmel…: umlauts spelled out, other accents dropped,
// apostrophes too ("Carlito's" -> "carlitos").
export function fold(s: string, umlauts = true): string {
  let out = s.toLowerCase().replace(/['’`]/g, "");
  if (umlauts) out = out.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
  return out
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// A title, both ways of spelling its umlauts, for LIKE searches.
export const foldTitle = (title: string) => fold(title) + " " + fold(title, false);

// A search box's matcher: every word of the query somewhere in the text,
// folded the same way, so "himmel münchner" finds Ein.Muenchner.im.Himmel.
// An empty query matches everything.
export function matchesWords(query: string): (text: string) => boolean {
  const words = fold(query).split(" ").filter(Boolean);
  if (!words.length) return () => true;
  return (text) => {
    const folded = fold(text);
    return words.every((w) => folded.includes(w));
  };
}
