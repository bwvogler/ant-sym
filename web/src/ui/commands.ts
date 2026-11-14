// The command palette's matching (PRD §69.3, ja-mvo9.2): every action on the page, found by typing part of its name.
// Pure, so `node --test` covers the ranking; ui/Palette.tsx shows it and runs the choice.

/** One thing the palette can do. */
export interface Command {
  id: string;
  /** what the list shows, and what typing matches first */
  label: string;
  /** the heading it is listed under */
  group: string;
  /** more words it answers to (not shown) */
  words?: string;
  /** its key, shown beside it */
  key?: string;
  /** greyed, with why: the command is listed but can't run now */
  off?: string;
}

/** How well `q` (one lower-case word) matches `text`: 4 the start, 3 a word's start, 2 inside, 1 its letters in order, 0 not at all. */
export function wordScore(text: string, q: string): number {
  const t = text.toLowerCase();
  if (t.startsWith(q)) return 4;
  const at = t.indexOf(q);
  if (at > 0) return /[\s\-:·(/]/.test(t[at - 1]!) ? 3 : 2;
  let j = 0;
  for (let k = 0; k < t.length && j < q.length; k++) if (t[k] === q[j]) j++;
  return j === q.length ? 1 : 0;
}

/**
 * The commands that match `query`, best first: every word of it must match the label or the extra words (the label
 * counts double), and ties keep the given order. An empty query gives them all, in order.
 */
export function rank<C extends Command>(commands: readonly C[], query: string): C[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...commands];
  const scored: { c: C; score: number; n: number }[] = [];
  commands.forEach((c, n) => {
    let score = 0;
    for (const w of words) {
      const s = Math.max(2 * wordScore(c.label, w), wordScore(`${c.group} ${c.words ?? ""}`, w));
      if (s === 0) return;
      score += s;
    }
    scored.push({ c, score, n });
  });
  return scored.sort((a, b) => b.score - a.score || a.n - b.n).map((s) => s.c);
}
