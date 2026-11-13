/*
 * Fuzzy matching for the command palette: the letters of the query must
 * appear in order in the text, and matches score higher when they are
 * consecutive, start a word, or come early.
 */

export interface FuzzyMatch {
  score: number;
  /** Indexes in the text of the matched characters, for highlighting. */
  positions: number[];
}

const isBoundary = (text: string, i: number) => i === 0 || /[\s\-_./\\:›]/.test(text[i - 1]) || (/[a-z]/.test(text[i - 1]) && /[A-Z]/.test(text[i]));

/** Matches `query` against `text`, ignoring case and spaces in the query; null if it does not match. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.toLowerCase().replace(/\s+/g, "");
  if (needle === "") return { score: 0, positions: [] };
  const hay = text.toLowerCase();

  // A plain substring is the best kind of match; prefer one that starts a word.
  let at = -1;
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
    if (at === -1) at = i;
    if (isBoundary(text, i)) {
      at = i;
      break;
    }
  }
  if (at !== -1) {
    const positions = Array.from({ length: needle.length }, (_, k) => at + k);
    return { score: 1000 + (isBoundary(text, at) ? 200 : 0) - at - (hay.length - needle.length) * 0.5, positions };
  }

  // Otherwise the letters in order, greedily, preferring word starts.
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  for (const ch of needle) {
    let found = -1;
    for (let i = from; i < hay.length; i++) {
      if (hay[i] !== ch) continue;
      if (found === -1) found = i;
      if (isBoundary(text, i)) {
        found = i;
        break;
      }
      // The very next character continues a run: take it.
      if (positions.length && i === positions[positions.length - 1] + 1) {
        found = i;
        break;
      }
    }
    if (found === -1) return null;
    const previous = positions[positions.length - 1];
    score += 10 + (isBoundary(text, found) ? 30 : 0) + (previous !== undefined && found === previous + 1 ? 20 : 0) - (found - from) * 0.5;
    positions.push(found);
    from = found + 1;
  }
  return { score: score - hay.length * 0.2, positions };
}

/** The items that match, best first; ties keep their original order. */
export function fuzzyFilter<T>(query: string, items: readonly T[], textOf: (item: T) => string, limit = 50): { item: T; match: FuzzyMatch }[] {
  const out: { item: T; match: FuzzyMatch; index: number }[] = [];
  items.forEach((item, index) => {
    const match = fuzzyMatch(query, textOf(item));
    if (match) out.push({ item, match, index });
  });
  out.sort((a, b) => b.match.score - a.match.score || a.index - b.index);
  return out.slice(0, limit);
}
