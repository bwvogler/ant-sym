// What the page calls the colonies. The player is the fungus, so no colony is
// "yours": they are named for how they are drawn (ColonyField), the first in
// ink and the second in the warn tone. Index k is Game.colonies[k].

export const COLONY_NAMES = ["Ink", "Amber"] as const;

/** Tailwind text colour for colony k's name, matching its ants on the field. */
export const COLONY_TONES = ["text-fg", "text-warn"] as const;

export function colonyName(k: number): string {
  return COLONY_NAMES[k] ?? `Colony ${k + 1}`;
}

export function colonyTone(k: number): string {
  return COLONY_TONES[k] ?? "text-fg-2";
}
