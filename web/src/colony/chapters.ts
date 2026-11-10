// The fungus game's goals, pure (ja-lo8.5): where the player stands, as one line for the top bar. Each chapter ends
// when what it asks for is true of the game; later chapters wait on mechanics still to be built (the queen as a host,
// ja-lo8.7; new queens and daughter colonies, ja-lo8.9), whose fields read false or 0 until then.

export const CHAPTERS = ["land", "host", "spread", "queen", "newQueen", "daughter", "open"] as const;
export type Chapter = (typeof CHAPTERS)[number];

/** What the goals read of a game: the colony the fungus landed by, and how far into it the fungus is. */
export interface ChapterState {
  /** the fungus has landed (Game.landed) */
  landed: boolean;
  /** the name of the colony it landed by */
  colony: string;
  /** that colony's ants carrying the fungus, and their share of its living ants */
  hosts: number;
  share: number;
  /** the fungus is in that colony's queen (ja-lo8.7) */
  queenInfected: boolean;
  /** new queens reared so far (ja-lo8.9) */
  gynes: number;
  /** daughter colonies founded so far (ja-lo8.9) */
  daughters: number;
}

/** The share of the colony a fungus must be in to have spread (chapter "spread"). */
export const SPREAD_SHARE = 0.25;

export interface ChapterView {
  chapter: Chapter;
  /** 1-based, of CHAPTERS.length − 1 (the open chapter has no number) */
  step: number;
  /** the goal, in words */
  goal: string;
  /** 0..1 toward the goal, where it can be measured */
  progress: number;
}

export function chapterOf(s: ChapterState): ChapterView {
  const view = (chapter: Chapter, goal: string, progress = 0): ChapterView => ({ chapter, step: CHAPTERS.indexOf(chapter) + 1, goal, progress: Math.max(0, Math.min(1, progress)) });
  if (!s.landed) return view("land", `Land by the ${s.colony} colony's hole.`);
  if (s.hosts === 0) return view("host", `Your spores lie by the ${s.colony} colony's hole: wait for an ant to walk through them.`);
  if (s.share < SPREAD_SHARE) return view("spread", `Spread through a quarter of the ${s.colony} colony.`, s.share / SPREAD_SHARE);
  if (!s.queenInfected) return view("queen", `Reach the ${s.colony} colony's queen: she lies in the royal chamber, tended by its youngest ants.`);
  if (s.gynes === 0) return view("newQueen", `Make the ${s.colony} colony raise a new queen.`);
  if (s.daughters === 0) return view("daughter", "Write the new queen's doctrine, and see her colony grow.");
  return view("open", "Every queen born with you in her opens the pen again.");
}
