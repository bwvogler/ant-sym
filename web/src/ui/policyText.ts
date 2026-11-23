import {
  AROUSALS,
  CARRYING,
  FUNGAL_PLACES,
  HOMES,
  MODES,
  modeSchema,
  STANCES,
  TASKS,
  TOUCHES,
  TRAILS,
  type Mode,
  type Situation,
  type Species,
} from "../colony/index.ts";

// The local rules in words, for Lab mode's Policy tab (PolicyTab.tsx). Each mode and
// stance rule is a row the tab shows ("when …, then …") with the test it
// stands for; tests/policyText.test.ts walks every situation and checks that
// the rows, read top to bottom, give exactly what localPolicy
// gives. So the words can't drift from the code: change a rule there and the
// test names the row to rewrite here.

export interface RuleRow<S, A extends string> {
  when: string;
  then: A;
  test: (s: S) => boolean;
}

/** localPolicy (colony.ts), row by row: the first row that holds decides. */
export const LOCAL_MODE_RULES: RuleRow<Situation, Mode>[] = [
  { when: "it is tired (searched long outside without finding food)", then: "return", test: (s) => s.tired },
  {
    when: "its stance is raid (on open ground: a raid trail or its own errand recruited it) and it is exploring or fighting",
    then: "fight",
    test: (s) => s.stance === "raid" && (s.mode === "explore" || s.mode === "fight"),
  },
  {
    when: "its stance is defend (on open ground: it senses a threat near its nest) and there is alarm scent ahead",
    then: "fight",
    test: (s) => s.stance === "defend" && s.alarm !== "none",
  },
  { when: "it was fighting, and its stance is not raid", then: "return", test: (s) => s.mode === "fight" },
  { when: "a strong food trail lies ahead", then: "follow", test: (s) => s.foodTrail === "strong" },
  { when: "no food trail lies ahead", then: "explore", test: (s) => s.foodTrail === "none" },
];

/** Strangers in reach are not this rule's to answer (behaviour MR 4): the contact response decides. */
export const LOCAL_MODE_STRANGERS =
  "Strangers within reach are not this rule's: the ant's contact response answers them (fight, flee, or drop and run; see Small responses).";

/** What localPolicy does when no row holds: a faint trail keeps the ant at what it was doing, and one heading home turns to follow it. */
export const LOCAL_MODE_OTHERWISE =
  "Otherwise (a faint food trail): keep doing what it was doing; an ant that was going home follows the trail back out instead.";
export function localModeOtherwise(s: Situation): Mode {
  return s.mode === "return" ? "follow" : s.mode;
}

/** The rows applied in order: what the drawer's words say the rule does. */
export function byRows<S, A extends string>(rows: readonly RuleRow<S, A>[], otherwise: (s: S) => A, s: S): A {
  for (const r of rows) if (r.test(s)) return r.then;
  return otherwise(s);
}

/** The fungus's local rule (fungalPolicy.ts localFungusRule) in words. */
export const LOCAL_FUNGUS_RULES: string[] = [
  "Groomed, with “groomed hosts hide” on (Lab → Levers): hide the fungus (fungus showing: hidden).",
  "With “cull” on, a host fighting a foreigner: the odour weapon (lethal; only if it is on the menu and, in the game, your fungus has kept the Odour weapon upgrade).",
  "Otherwise: what your strain, Garden, does by default: hosts carry the fungus's odour and tolerate strangers a little (blend), as far as your Recognition upgrade reaches. Levers off the menu stay as they are.",
];

/** The ant's small responses on this page: decided by the local rule (responses.ts localResponses), never asked live here. */
export const LOCAL_RESPONSE_RULES: [hook: string, rule: string][] = [
  ["get", "Pick food up unless fighting; soil, corpses and brood whenever the chance comes."],
  ["carry", "Take whatever it holds where it belongs: food home, soil to the mound, the dead to the midden, brood to a brood chamber."],
  ["drop", "Put food down where it goes."],
  [
    "trail",
    "Carrying food: lay the food trail, more for richer food. Walking out: lay the home trail. Porters, soil and corpse carriers: nothing.",
  ],
  [
    "alarm",
    "Strong alarm repels every ant but fighters and diggers. On the surface a faint one draws an explorer with empty jaws to look, and a follower keeps to its trail.",
  ],
  [
    "contact",
    "Strangers in reach: an ant carrying something takes it home; raiding, defending, or already sent to fight, it fights; otherwise, foraging, it turns away and goes home.",
  ],
  [
    "leave",
    "Rested and waiting at home: many nestmates coming home with food, go now; a few, go soon; none, and home crowded, now and then go out as a raid scout; none, wait, and only now and then go out to scout. An ant that defends goes out whatever comes back. A raider waits for a scout's raid trail, and goes on it.",
  ],
];

/**
 * Where a species' rule text (Species.ruleText, ja-fnd.5.13) disagrees with its own local rule: every situation its mode schema has, read
 * through the rows as the drawer shows them, against what its policy answers. Empty when the words match the code; the test of each species
 * that ships its own rule asserts it, as policyText.test.ts does for the generic ant.
 */
export function ruleTextAgrees(species: Species): string[] {
  const text = species.ruleText;
  const rule = species.policy;
  if (!text || !rule) return [];
  const schema = modeSchema(species.lanes.mode);
  const out: string[] = [];
  for (let code = 0; code < schema.size; code++) {
    const own = schema.decode(code);
    const s = own as Situation;
    const said = byRows(text.rows, text.otherwiseMode, s);
    const did = rule(s);
    if (said !== did) out.push(`${schema.key(own)}: the words say ${said}, the rule ${did}`);
  }
  return out;
}

/** What the generic senses rows say about each mode-lane field, by name: a species' own schema reuses them for the fields it keeps. */
export const MODE_SENSES: Record<string, [values: string, about: string]> = {
  mode: [MODES.join(" · "), "what it is doing now"],
  tired: ["true · false", "it searched long outside without finding food"],
  foodTrail: [TRAILS.join(" · "), "food scent just ahead"],
  homeTrail: [HOMES.join(" · "), "home scent ahead on the ground; underground, the chamber it stands in"],
  alarm: [TRAILS.join(" · "), "alarm scent just ahead"],
  enemy: ["none · near", "an ant of the other colony within two steps (strangers it touches are the contact response's to answer)"],
  stance: [STANCES.join(" · "), "the ant's own: defend while it senses a threat near its nest, raid once recruited"],
};

/** What the fungus senses in an ant, a row per field of FUNGAL_SCHEMA in its order: [name, the values, what it is]. policyText.test.ts keeps the rows in step with the schema. */
export const FUNGAL_SENSES: [name: string, values: string, about: string][] = [
  ["arousal", AROUSALS.join(" · "), "the host's arousal: it smells alarm, or strangers are close (amines rise with fighting)"],
  ["touch", TOUCHES.join(" · "), "who touches its cuticle: a nestmate or an ant of another colony"],
  ["place", FUNGAL_PLACES.join(" · "), "what is underfoot: open ground, a tunnel, a chamber's floor, the queen's mark"],
  ["task", TASKS.join(" · "), "its body's stage of life (juvenile hormone tracks task): nurse, inside worker, forager"],
  ["carrying", CARRYING.join(" · "), "what is in its jaws"],
  ["groomed", "true · false", "its nestmates are grooming the fungus off it"],
];
