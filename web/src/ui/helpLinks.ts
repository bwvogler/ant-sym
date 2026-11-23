import { type Situation, TRAILS } from "../colony/index.ts";
import type { LearnTarget } from "./learn.ts";

// Where each "?" leads (ja-fnd.6.6, docs/refactor.md S5.6): the situation chips on an ant's card each point at the Codex entry or Policy
// section that explains them. The map is data here, not inline in the card, and helpTargets.test.ts holds every target in the page to a
// guide entry or a policy section that exists.

/** The Lab's Policy tab sections a "?" may open (PolicyTab.tsx's `<Section id>`s; a test holds the two together). */
export const POLICY_SECTIONS = ["mode", "fungus", "sent", "responses"] as const;

/** The situation's fields, each with where it is explained: the Codex's guide, or Lab mode's Policy tab ("mode"). */
export function situationChips(s: Situation, fields?: readonly string[]): [string, string, LearnTarget][] {
  const underground = !(TRAILS as readonly string[]).includes(s.homeTrail);
  // Each chip with the situation field it shows; a species' own schema keeps only its fields (review of #132).
  const all: [field: string, chip: [string, string, LearnTarget]][] = [
    ["mode", ["mode", s.mode, { tab: "policy", id: "mode" }]],
    ["tired", [s.tired ? "tired" : "fresh", "", { tab: "guide", id: "fatigue" }]],
    ["foodTrail", ["food", s.foodTrail, { tab: "guide", id: "food-trail" }]],
    ["homeTrail", ["home", s.homeTrail, { tab: "guide", id: underground ? "inside" : "home-trail" }]],
    ["alarm", ["alarm", s.alarm, { tab: "guide", id: "alarm" }]],
    ["enemy", ["enemy", s.enemy, { tab: "guide", id: "strangers" }]],
    ["stance", ["stance", s.stance, { tab: "guide", id: "strangers" }]],
  ];
  return all.filter(([field]) => !fields || fields.includes(field)).map(([, chip]) => chip);
}
