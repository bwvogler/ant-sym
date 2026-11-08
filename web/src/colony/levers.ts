// The fungus's levers (the fungus game, ja-lo8.4; docs/fungus-policy.md §11): pure, no DOM.
//
// A lever is a gain on one of the host's channels: what it perceives (perception) or what it gives off (emission).
// The fungus policy sets a level for every lever in a fungal situation, so it pulls as many as its aim calls for at
// once; "as is" leaves a channel alone. Each lever's levels are values of the fields of `Levers` it owns, and no two
// levers own the same field, so a host's levers compose by laying each lever's values over the world as it is.
//
// The interventions the fungus ran before (soothe, share, roam, blend, …) are kept as PRESETS: named sets of levels
// whose values are exactly the old bundles' (soothe is alarm 0.25, calm 0.8, tolerance +0.3, quiet 0.9 as before). The
// local rule runs them, so a game the local rule plays runs as it did; Jev answers lever by lever.

/** What the fungus does to a host at full load; a host at load l gets the lerp from "as it is" by l (Fungus.express). */
export interface Levers {
  /** food scent gain (A1) */
  food: number;
  /** home scent gain (A2) */
  home: number;
  /** alarm gain (A4) */
  alarm: number;
  /** the rival's food trail smelled as food scent, × this (A3) */
  foreignFood: number;
  /** the host's sense of time out: tired after patience × this (A10) */
  clock: number;
  /** the calming cue the host gives off, 0..1: lowers the aggression it receives and gives (B1, Rickia's n-C23) */
  calm: number;
  /** added to the host's tolerance: it perceives fewer ants as strangers (B4); negative: more */
  tolerance: number;
  /** the fungal share of the host's odour, 0..MAX_MASK: the fungus's own odour, between the colonies' (B3/B7) */
  mask: number;
  /** trail laid × this (C1) */
  lay: number;
  /** carrying food, the host also lays this share of its food trail into the other colony's field (C2) */
  crossLay: number;
  /** in a fight the host lays (1 − this) of the alarm (C3); negative: more than as is */
  quiet: number;
  /** pushes the host's odour this far (× 0.5) away from its nest's: its own colony takes it for a stranger (B6, the odour weapon) */
  estrange: number;
  /** the nest's floor marks smelled × this (nest slice 8: road signs, and which chamber it is in) */
  marks: number;
  /** 1: brood smells like store and store like brood (nest slice 8) */
  swap: number;
  /** 1: the host kills the queen and the brood it touches (nest slice 8: lethal) */
  regicide: number;
  /** the share of its strain's visibility the host shows its groomers: under 1 it hides the fungus (§6, stealth) */
  show: number;
  /** a queen's royal mark laid × this (ja-lo8.7): damped, her signal is faint, and nurses come to rear new queens (docs/new-queens.md §4) */
  queenSignal: number;
  /** how strongly the host perceives the queen's scent it and its nestmates carry (ja-lo8.9): damped, nurses take her signal for faint and rear new queens (docs/new-queens.md §4) */
  queenScent: number;
}

/** The world as it is. */
export const AS_IS: Levers = { food: 1, home: 1, alarm: 1, foreignFood: 0, clock: 1, calm: 0, tolerance: 0, mask: 0, lay: 1, crossLay: 0, quiet: 0, estrange: 0, marks: 1, swap: 0, regicide: 0, show: 1, queenSignal: 1, queenScent: 1 };

export type LeverKind = "perceive" | "emit" | "lethal";

/** One lever: its levels, from the lowest to the highest, and which of them is "as is". */
export interface Lever {
  id: string;
  kind: LeverKind;
  /** what it is, in a few words (Jev's question names it; the panel shows it) */
  name: string;
  /** what pulling it does to the host, for the Learn drawer and the panel */
  blurb: string;
  /** the same in a few words, for the legend Jev reads (fungusBrain.FUNGUS_LEGEND: every request carries it) */
  brief: string;
  /** each level in words, lowest first: what the panel shows, and the legend's account of the lever */
  words: readonly string[];
  /** each level's values for the fields this lever owns, lowest first */
  values: readonly Partial<Levers>[];
  /** the level that leaves the host as it is */
  asIs: number;
  /** only where there is a nest (the side view): chambers' marks, the queen */
  nest?: boolean;
  /** which hosts it means something in: workers (the default), a queen, or both */
  hosts?: "workers" | "queen" | "both";
}

const five = (field: keyof Levers, v: readonly number[]): Partial<Levers>[] => v.map((x) => ({ [field]: x }));

/**
 * Every lever, in the order Jev is asked them. Values at the levels the presets use are the old interventions' exactly
 * (fungus-policy §11.3); the levels between are spaced so a step is a clear change.
 */
export const LEVERS: readonly Lever[] = [
  // Perception: what the host senses.
  { id: "food", kind: "perceive", name: "food scent", blurb: "how strongly the host smells food trails: damped, trails fade and it explores; boosted, it piles onto routes", brief: "how strongly it smells food trails", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("food", [0.2, 0.6, 1, 1.5, 2.5]), asIs: 2 },
  { id: "rival", kind: "perceive", name: "rival trails as food", blurb: "the host smells other colonies' food trails as its own, and follows them to their food", brief: "it follows other colonies' food trails as its own", words: ["as is (it ignores them)", "partly", "fully"], values: five("foreignFood", [0, 0.5, 1]), asIs: 0 },
  { id: "home", kind: "perceive", name: "home scent", blurb: "how strongly the host smells the way home: damped, it ranges far; boosted, it clings to home", brief: "how strongly it smells the way home (damped: ranges far)", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("home", [0.35, 0.65, 1, 1.5, 2.5]), asIs: 2 },
  { id: "alarm", kind: "perceive", name: "alarm", blurb: "how strongly the host smells alarm: damped, it stays calm under alarm; boosted, it is skittish and routed easily", brief: "how strongly it smells alarm (boosted: skittish)", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("alarm", [0.25, 0.6, 1, 1.6, 2.5]), asIs: 2 },
  { id: "strangers", kind: "perceive", name: "stranger scent", blurb: "how strange other colonies' ants smell to the host: damped, they smell like nestmates and it fights fewer of them; boosted, it takes more ants for strangers", brief: "how strange other colonies' ants smell (damped: fights fewer)", words: ["strongly damp (strangers smell like nestmates)", "damp", "as is", "boost", "strongly boost"], values: five("tolerance", [0.3, 0.15, 0, -0.1, -0.2]), asIs: 2 },
  { id: "marks", kind: "perceive", name: "floor marks", blurb: "how strongly the host smells the nest's floor marks: damped, it loses its way inside, and at the extreme brood and store smell alike", brief: "how well it reads the nest's floor marks (-2: lost inside)", words: ["strongly damp (lost inside; brood and store swapped)", "damp", "as is", "boost", "strongly boost"], values: [{ marks: 0.3, swap: 1 }, { marks: 0.6 }, { marks: 1 }, { marks: 1.5 }, { marks: 2 }], asIs: 2, nest: true },
  { id: "time", kind: "perceive", name: "time out", blurb: "how long a search feels to the host: longer, it tires slowly and ranges far; shorter, it tires fast and stays home", brief: "how long a search feels (damped: tires slowly, ranges far)", words: ["much longer (tires slowly)", "longer", "as is", "shorter", "much shorter (tires fast)"], values: five("clock", [2.5, 1.6, 1, 0.7, 0.5]), asIs: 2 },
  { id: "queenScent", kind: "perceive", name: "queen scent", blurb: "how strongly the host perceives the queen's scent that nestmates carry from her: damped, nurses take her for faint or gone, and rear new queens from the brood they tend", brief: "how strongly it perceives the queen's scent (damped: nurses rear new queens)", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("queenScent", [0.1, 0.3, 1, 1.5, 2]), asIs: 2, nest: true },
  // Emission: what the host gives off.
  { id: "trail", kind: "emit", name: "trail laid", blurb: "how much trail the host lays: damped, a quiet host leaves little; boosted, loud trails", brief: "how much trail it lays", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("lay", [0.2, 0.6, 1, 1.5, 2.5]), asIs: 2 },
  { id: "leak", kind: "emit", name: "trail leaked to rivals", blurb: "carrying food, the host also lays its food trail into other colonies' fields: it shows them where food is", brief: "it lays its food trail into other colonies' fields too", words: ["as is (none)", "some", "all of it"], values: five("crossLay", [0, 0.5, 1]), asIs: 0 },
  { id: "alarmLaid", kind: "emit", name: "alarm laid", blurb: "how much alarm the host raises when it fights: damped, a skirmish recruits no defenders; boosted, every fight calls more", brief: "how much alarm it raises in a fight (damped: silent)", words: ["strongly damp (silent fights)", "damp", "as is", "boost", "strongly boost"], values: five("quiet", [0.9, 0.5, 0, -0.5, -1]), asIs: 2 },
  { id: "calm", kind: "emit", name: "calming cue", blurb: "a cue the host gives off that lowers the aggression of the ants it meets, and its own", brief: "a cue that calms the ants it meets", words: ["as is (none)", "some", "strong"], values: five("calm", [0, 0.4, 0.8]), asIs: 0 },
  { id: "odour", kind: "emit", name: "fungal odour", blurb: "the host carries the fungus's own odour, between the colonies': colonies whose ants carry it come to smell alike", brief: "your own odour on it: colonies carrying it come to smell alike", words: ["as is (none)", "some", "strong"], values: five("mask", [0, 0.3, 0.6]), asIs: 0 },
  { id: "show", kind: "emit", name: "fungus showing", blurb: "how much of the fungus the host shows its nestmates: hidden, it is groomed off less; shown, more", brief: "how much of you it shows (damped: groomed off less)", words: ["hidden", "dim", "as is", "plain", "loud"], values: five("show", [0.25, 0.5, 1, 1.5, 2]), asIs: 2, hosts: "both" },
  { id: "queenSignal", kind: "emit", name: "queen signal", blurb: "how much of her royal mark a queen lays: damped, her signal is faint where her brood lies, and nurses rear new queens there", brief: "in a queen: how much of her royal mark she lays (damped: nurses rear new queens)", words: ["strongly damp", "damp", "as is", "boost", "strongly boost"], values: five("queenSignal", [0.1, 0.4, 1, 1.5, 2]), asIs: 2, nest: true, hosts: "queen" },
  // Lethal: off unless the player turns them on.
  { id: "weapon", kind: "lethal", name: "odour weapon", blurb: "the host smells like nobody's: its own colony and the others take it for a stranger and kill it", brief: "it smells like nobody's: its own colony kills it", words: ["off", "on"], values: five("estrange", [0, 1]), asIs: 0 },
  { id: "crown", kind: "lethal", name: "crown", blurb: "the host kills the queen and the brood it tends: the colony is orphaned", brief: "it kills the queen and brood it tends", words: ["off", "on"], values: five("regicide", [0, 1]), asIs: 0, nest: true },
];

/**
 * A lever's levels as Jev's score question lists them, lowest first: short labels, so each of a host's questions is
 * small; the legend says once what each lever's levels mean (fungusBrain.FUNGUS_LEGEND).
 */
export function scale(lever: Lever): string[] {
  const n = lever.words.length;
  if (n === 5) return ["-2", "-1", "0", "+1", "+2"];
  return Array.from({ length: n }, (_, k) => String(k)); // 0..2 (none, some, strong) or 0..1 (off, on)
}

/** The index of a lever by id. */
export function leverIndex(id: string): number {
  const k = LEVERS.findIndex((v) => v.id === id);
  if (k < 0) throw new Error(`no lever "${id}"`);
  return k;
}

/** Levers that kill their host: off the player's menu until turned on. */
export const LETHAL_LEVERS: ReadonlySet<string> = new Set(LEVERS.filter((v) => v.kind === "lethal").map((v) => v.id));
/** Levers that act on the nest (its chambers' marks, its queen): offered only in the side view. */
export const NEST_LEVERS: ReadonlySet<string> = new Set(LEVERS.filter((v) => v.nest).map((v) => v.id));

/** A level for some levers, by id (the level's index into the lever's `words`); a lever left out is as is. */
export type LeverLevels = Readonly<Record<string, number>>;

/** The values a host at full load takes: each lever's level laid over the world as it is, levers off the menu left as is. */
export function compose(levels: LeverLevels, menu?: ReadonlySet<string>): Levers {
  const out: Levers = { ...AS_IS };
  for (const [id, level] of Object.entries(levels)) {
    if (menu && !menu.has(id)) continue;
    const lever = LEVERS.find((v) => v.id === id);
    if (!lever) continue;
    const at = lever.values[Math.max(0, Math.min(lever.values.length - 1, Math.round(level)))];
    if (at) Object.assign(out, at);
  }
  return out;
}

/** The levers pulled away from "as is" in `levels`, in table order: what the panel lists. */
export function pulled(levels: LeverLevels, menu?: ReadonlySet<string>): { lever: Lever; level: number }[] {
  const out: { lever: Lever; level: number }[] = [];
  for (const lever of LEVERS) {
    const level = levels[lever.id];
    if (level === undefined || level === lever.asIs || (menu && !menu.has(lever.id))) continue;
    out.push({ lever, level });
  }
  return out;
}

/** A named set of levels: what the fungus ran before as one intervention, and what the local rule runs now. */
export interface Preset {
  id: string;
  name: string;
  /** what it does, for the panel */
  blurb: string;
  levels: LeverLevels;
}

/**
 * The old interventions, as levels. Index 0 is dormant, and a host's `expr` names the preset it runs (CUSTOM when Jev's
 * levels match none). New presets are appended so an index keeps its meaning.
 */
export const PRESETS: readonly Preset[] = [
  { id: "dormant", name: "dormant", blurb: "does nothing to its host, and hides: it shows its groomers a quarter as much", levels: { show: 0 } },
  { id: "soothe", name: "soothe", blurb: "its host gives off a calming cue, tolerates strangers, barely smells alarm and fights without raising it", levels: { alarm: 0, calm: 2, strangers: 0, alarmLaid: 0 } },
  { id: "share", name: "share", blurb: "its host smells the rival's food trail as its own and food scent strongly, lays a louder trail, and leaks its food trail to the rival", levels: { food: 3, rival: 2, trail: 3, leak: 2 } },
  { id: "roam", name: "roam", blurb: "its host barely smells home and feels its time out slowly, so it ranges far", levels: { home: 0, time: 0 } },
  { id: "blend", name: "blend", blurb: "its host carries the fungus's own odour, between the colonies', and tolerates the odours in between", levels: { odour: 2, strangers: 1 } },
  { id: "cull", name: "cull", blurb: "its host smells like nobody's: its own colony and the rival's both take it for a stranger (lethal)", levels: { weapon: 1 } },
  { id: "muddle", name: "muddle", blurb: "its host misreads its nest: brood smells like store; it gets lost inside", levels: { marks: 0 } },
  { id: "crown", name: "crown", blurb: "its host kills the queen and brood it touches: the colony is orphaned (lethal)", levels: { crown: 1 } },
];

/** A host whose levels match no preset (Jev's own mix). */
export const CUSTOM = 255;

/** The index of a preset by id. */
export function preset(id: string): number {
  const k = PRESETS.findIndex((v) => v.id === id);
  if (k < 0) throw new Error(`no preset "${id}"`);
  return k;
}

/** The preset these levels are (under the menu), or CUSTOM. Levels that pull nothing are 0: a host as it is (expr 0, as always). */
export function presetOf(levels: LeverLevels, menu?: ReadonlySet<string>): number {
  const mine = pulled(levels, menu);
  if (mine.length === 0) return 0;
  for (let k = 0; k < PRESETS.length; k++) {
    const p = pulled((PRESETS[k] as Preset).levels, menu);
    if (p.length === mine.length && p.every((x, j) => x.lever.id === mine[j]!.lever.id && x.level === mine[j]!.level)) return k;
  }
  return CUSTOM;
}

/** Levels as a cache answer: one level per asked lever, in the order asked ("2,2,3,0"). */
export function encodeLevels(levels: LeverLevels, asked: readonly string[]): string {
  return asked.map((id) => String(levels[id] ?? LEVERS[leverIndex(id)]!.asIs)).join(",");
}

/** A cache answer back to levels for the levers asked, or null if it is not one (wrong count, a level out of range). */
export function decodeLevels(answer: string, asked: readonly string[]): LeverLevels | null {
  const parts = answer.split(",");
  if (parts.length !== asked.length || asked.length === 0) return null;
  const out: Record<string, number> = {};
  for (let k = 0; k < asked.length; k++) {
    const lever = LEVERS.find((v) => v.id === asked[k]);
    const level = Number(parts[k]);
    if (!lever || !Number.isInteger(level) || level < 0 || level >= lever.words.length) return null;
    out[lever.id] = level;
  }
  return out;
}

/** Whether lever `v` means something in a host of this kind: a queen's levers in a queen, a worker's in a worker. */
export function leverFor(v: Lever, queen: boolean): boolean {
  const h = v.hosts ?? "workers";
  return h === "both" || (h === "queen") === queen;
}
