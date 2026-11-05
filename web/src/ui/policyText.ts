import type { Mode, Situation, Stance, StanceSituation } from "../colony/colony.ts";

// The local rules in words, for the Learn drawer's Policy tab. Each mode and
// stance rule is a row the drawer shows ("when …, then …") with the test it
// stands for; tests/policyText.test.ts walks every situation and checks that
// the rows, read top to bottom, give exactly what localPolicy and localStance
// give. So the words can't drift from the code: change a rule there and the
// test names the row to rewrite here.

export interface RuleRow<S, A extends string> {
  when: string;
  then: A;
  test: (s: S) => boolean;
}

/** localPolicy (colony.ts), row by row: the first row that holds decides. */
export const LOCAL_MODE_RULES: RuleRow<Situation, Mode>[] = [
  { when: "an ant of the other colony is within two steps", then: "fight", test: (s) => s.enemy === "near" },
  { when: "it is tired (searched long outside without finding food)", then: "return", test: (s) => s.tired },
  { when: "the colony raids and the ant is exploring or fighting", then: "fight", test: (s) => s.stance === "raid" && (s.mode === "explore" || s.mode === "fight") },
  { when: "the colony defends and there is alarm scent ahead", then: "fight", test: (s) => s.stance === "defend" && s.alarm !== "none" },
  { when: "it was fighting and no enemy is near: the fight is over", then: "return", test: (s) => s.mode === "fight" },
  { when: "a strong food trail lies ahead", then: "follow", test: (s) => s.foodTrail === "strong" },
  { when: "no food trail lies ahead", then: "explore", test: (s) => s.foodTrail === "none" },
];

/** What localPolicy does when no row holds: a faint trail keeps the ant at what it was doing, and one heading home turns to follow it. */
export const LOCAL_MODE_OTHERWISE = "Otherwise (a faint food trail): keep doing what it was doing; an ant that was going home follows the trail back out instead.";
export function localModeOtherwise(s: Situation): Mode {
  return s.mode === "return" ? "follow" : s.mode;
}

/** localStance (colony.ts), row by row. */
export const LOCAL_STANCE_RULES: RuleRow<StanceSituation, Stance>[] = [
  { when: "enemies are near the nest and ants were lost lately", then: "defend", test: (s) => s.enemyNearNest && s.losses !== "none" },
  { when: "food on the map is scarce and the colony is not small", then: "raid", test: (s) => s.foodLeft === "scarce" && s.ants !== "few" },
  { when: "the larder is full and the colony is at its size", then: "raid", test: (s) => s.larder === "full" && s.ants === "many" },
];
export const LOCAL_STANCE_OTHERWISE: Stance = "forage";

/** The rows applied in order: what the drawer's words say the rule does. */
export function byRows<S, A extends string>(rows: readonly RuleRow<S, A>[], otherwise: (s: S) => A, s: S): A {
  for (const r of rows) if (r.test(s)) return r.then;
  return otherwise(s);
}

/** The fungus's local rule (fungalPolicy.ts localFungusRule) in words. */
export const LOCAL_FUNGUS_RULES: string[] = [
  "Groomed, with “hide groomed hosts” on: go dormant (a dormant host shows its groomers a quarter as much).",
  "With “cull” on, a high-load host fighting strangers: kill it (Bloom only).",
  "Otherwise: what the strain was bred for (Lockpick soothes, Bloom shares, Garden blends), within what the menu has on.",
];

/** The ant's small responses on this page: decided by the local rule (responses.ts localResponses), never asked live here. */
export const LOCAL_RESPONSE_RULES: [hook: string, rule: string][] = [
  ["get", "Pick food up unless fighting; soil, corpses and brood whenever the chance comes."],
  ["carry", "Take whatever it holds where it belongs: food home, soil to the mound, the dead to the midden, brood to a brood chamber."],
  ["drop", "Put food down where it goes."],
  ["trail", "Carrying food: lay the food trail, more for richer food. Walking out: lay the home trail. Porters, soil and corpse carriers: nothing."],
];
