// The fungus's body and evolution (ja-lo8.12), pure.
//
// **Its body.** Where it lands the fungus takes root: a mycelium on the ground by the hole (Fungus.root), as
// *Metarhizium* lives for months in soil and roots without an insect (docs/fungus-body.md §1). Its mass grows on the
// substrate, logistically to what the patch can hold, and it puts out spores onto its patch at a share of its mass a
// second, paid out of that mass (design: the literature found gives no conversion). So the mycelium settles where
// growth meets sporulation, and a thicker fruiting body means more spores from a smaller mycelium.
//
// **Its evolution.** It adapts in its hosts: *Metarhizium* passed through ant groups evolved more spores and less of the
// cue groomers detect (docs/fungus-body.md §3). So adaptations come from fungus grown inside ants, by spores taking
// hold and by load passing on contact; growth on the substrate gives spores, not adaptations. Each threshold of growth
// in hosts gives one **adaptation**, and the player picks where it goes. The thresholds rise geometrically, as
// adaptation in experimental evolution speeds up far less than replication does. The numbers are design, tuned on
// `node scripts/progression.mjs` (PRD §50.11).
//
// Upgrades are of two kinds:
// - **Spread**, its body: infectivity (the strain's transmission), persistence (how little a host clears on its own),
//   immune evasion (how much of a host's primed resistance it slips past), its fruiting body (spores kept on its patch)
//   and its mycelium (how much mass the patch can hold).
// - **Reach**, its hold on the host: how far from "as is" each group of levers may go (levers.hold). Jev is still asked
//   every lever on its full scale and its answers are cached that way; reach acts only where levels take effect, so an
//   upgrade re-asks nothing and costs no tokens.
//
// The start must lose to grooming in the nest (transmission under what four groomers take off a visible host), so that
// what the player chooses is what takes it in. Lethal levers are not here: the player's menu still gates them (PRD §49).

import { LEVERS, type Reach } from "./levers.ts";

/** A spread trait an upgrade sets. */
export type Trait = "transmission" | "decay" | "evasion" | "spores" | "capacity";

export interface Upgrade {
  id: string;
  kind: "spread" | "reach";
  name: string;
  /** what it does, for the panel */
  blurb: string;
  /** what each level is, in words: index 0 is where the fungus starts */
  steps: readonly string[];
  /** adaptations for each level after the first: costs[k] takes it to level k + 1 */
  costs: readonly number[];
  /** spread: the trait it sets, and its value at each level */
  trait?: Trait;
  values?: readonly number[];
  /** reach: the levers it widens, and their reach at each level */
  levers?: readonly string[];
  reach?: readonly number[];
  /** only where there is a nest (the side view): its levers do nothing elsewhere */
  nest?: boolean;
}

/** The mycelium at its landing: the mass it starts with, how fast it grows (per second, logistic), and the mass one unit of spores costs. */
export const BODY = { start: 4, growth: 0.03, sporeMass: 1 };

/** Growth to the first adaptation, and how much more each one after asks than the last. */
export const ADAPT = { first: 10, ratio: 1.28 };

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "infectivity",
    kind: "spread",
    name: "Infectivity",
    blurb: "how fast it passes from a host to the ants it touches",
    steps: ["weak", "fair", "strong", "virulent"],
    costs: [1, 1, 3],
    trait: "transmission",
    values: [0.12, 0.15, 0.23, 0.3],
  },
  {
    id: "persistence",
    kind: "spread",
    name: "Persistence",
    blurb: "how little of it a host clears on its own",
    steps: ["clears fast", "clears slowly", "never clears"],
    costs: [1, 2],
    trait: "decay",
    values: [0.03, 0.012, 0],
  },
  {
    id: "mycelium",
    kind: "spread",
    name: "Mycelium",
    blurb: "how much mass its patch by the hole can hold: more mass grows faster and pays for more spores",
    steps: ["a thread", "a mat", "a web"],
    costs: [1, 2],
    trait: "capacity",
    values: [30, 60, 120],
  },
  {
    id: "fruiting",
    kind: "spread",
    name: "Fruiting body",
    blurb: "how much of its mycelium it turns into spores on its patch each second, for the ants that walk through: more spores, a smaller mycelium",
    steps: ["sparse", "thick", "dense"],
    costs: [1, 2],
    trait: "spores",
    values: [0.006, 0.012, 0.02],
  },
  {
    id: "evasion",
    kind: "spread",
    name: "Immune evasion",
    blurb: "how much of the resistance grooming builds in a colony it slips past",
    steps: ["none", "some", "most"],
    costs: [3, 4],
    trait: "evasion",
    values: [0, 0.35, 0.7],
  },
  {
    id: "stealth",
    kind: "reach",
    name: "Stealth",
    blurb: "how well a host can hide it from its groomers (fungus showing); your aim decides whether hosts hide",
    steps: ["shows as it is", "dim", "hidden"],
    costs: [1, 2],
    levers: ["show"],
    reach: [0, 1, 2],
  },
  {
    id: "senses",
    kind: "reach",
    name: "Senses",
    blurb: "how far it bends what a host smells: food, rival trails, home, alarm, floor marks, time out",
    steps: ["one step", "the full range"],
    costs: [2],
    levers: ["food", "rival", "home", "alarm", "marks", "time"],
    reach: [1, 2],
  },
  {
    id: "recognition",
    kind: "reach",
    name: "Recognition",
    blurb: "how far it bends who a host takes for a stranger: stranger scent, a calming cue, its own odour",
    steps: ["none", "one step", "the full range"],
    costs: [1, 3],
    levers: ["strangers", "calm", "odour"],
    reach: [0, 1, 2],
  },
  {
    id: "trails",
    kind: "reach",
    name: "Trails",
    blurb: "how far it bends what a host lays: trail, trail leaked to rivals, alarm in a fight",
    steps: ["none", "one step", "the full range"],
    costs: [1, 3],
    levers: ["trail", "leak", "alarmLaid"],
    reach: [0, 1, 2],
  },
  {
    id: "royal",
    kind: "reach",
    name: "Royal",
    blurb: "how far it bends a queen's royal mark (queen signal): the route to new queens",
    steps: ["none", "one step", "the full range"],
    costs: [2, 4],
    levers: ["queenSignal"],
    reach: [0, 1, 2],
    nest: true,
  },
];

/** An upgrade by id. */
export function upgrade(id: string): Upgrade {
  const u = UPGRADES.find((x) => x.id === id);
  if (!u) throw new Error(`no upgrade "${id}"`);
  return u;
}

/** The growth at which the n-th adaptation comes (n ≥ 1): increments of ADAPT.first, each ADAPT.ratio times the last. */
export function adaptationAt(n: number): number {
  return n <= 0 ? 0 : (ADAPT.first * (ADAPT.ratio ** n - 1)) / (ADAPT.ratio - 1);
}

/** The spread traits at a set of levels. */
export interface Traits {
  transmission: number;
  decay: number;
  /** share of a host's primed resistance the fungus slips past (0: none) */
  evasion: number;
  /** share of the mycelium's mass it puts out as spores a second */
  spores: number;
  /** the most mass its patch holds */
  capacity: number;
}

export interface EvolutionSave {
  strain: number;
  mass: number;
  growth: number;
  spent: number;
  levels: Record<string, number>;
}

/** One fungus's body and evolution: the strain it evolves, its mycelium's mass, the fungus it has made, and what it has chosen. */
export class Evolution {
  /** the strain (an index into the fungus's strains) whose traits it sets: the fungus that landed */
  readonly strain: number;
  /** the mycelium's mass at its landing */
  mass = BODY.start;
  /** fungus grown in hosts over the game: what adaptations come from */
  growth = 0;
  /** adaptations given to upgrades */
  spent = 0;
  readonly #levels: Record<string, number>;

  constructor(strain: number) {
    this.strain = strain;
    this.#levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  }

  /** The level chosen of upgrade `id` (0: as the fungus starts). */
  level(id: string): number {
    return this.#levels[id] ?? 0;
  }

  /** Adaptations its growth has given, spent or not. */
  get earned(): number {
    let n = 0;
    while (adaptationAt(n + 1) <= this.growth) n++;
    return n;
  }

  /** Adaptations to give. */
  get adaptations(): number {
    return this.earned - this.spent;
  }

  /** 0..1: how far its growth is from the last adaptation to the next. */
  get toNext(): number {
    const n = this.earned;
    const a = adaptationAt(n);
    return Math.max(0, Math.min(1, (this.growth - a) / (adaptationAt(n + 1) - a)));
  }

  /** Adaptations the next level of `id` takes, or null when it is at its last. */
  cost(id: string): number | null {
    return upgrade(id).costs[this.level(id)] ?? null;
  }

  /** Whether the next level of `id` can be chosen now. */
  affordable(id: string): boolean {
    const c = this.cost(id);
    return c !== null && c <= this.adaptations;
  }

  /** Give adaptations to the next level of `id`; false (nothing given) when it is at its last or there are too few. */
  buy(id: string): boolean {
    const c = this.cost(id);
    if (c === null || c > this.adaptations) return false;
    this.spent += c;
    this.#levels[id] = this.level(id) + 1;
    return true;
  }

  /**
   * dt seconds of the mycelium on its patch: it grows logistically to its capacity and puts out the fruiting body's
   * share of its mass as spores, paid out of that mass. Returns the spores put out.
   */
  grow(dt: number): number {
    const t = this.traits();
    this.mass += Math.max(0, BODY.growth * this.mass * (1 - this.mass / t.capacity) * dt);
    const spores = (t.spores * this.mass * dt) / BODY.sporeMass;
    this.mass -= spores * BODY.sporeMass;
    return spores;
  }

  /** Fungus grown in hosts (load they took on, from spores or by contact): it counts toward adaptations. */
  replicate(load: number): void {
    this.growth += load;
  }

  /** The spread traits at the levels chosen. */
  traits(): Traits {
    const out: Traits = { transmission: 0, decay: 0, evasion: 0, spores: 0, capacity: 0 };
    for (const u of UPGRADES) if (u.trait && u.values) out[u.trait] = u.values[this.level(u.id)] as number;
    return out;
  }

  /** Each lever's reach at the levels chosen; levers no upgrade names (the lethal ones) keep their full range. */
  reach(): Reach {
    const out: Record<string, number> = {};
    for (const u of UPGRADES) if (u.levers && u.reach) for (const id of u.levers) out[id] = u.reach[this.level(u.id)] as number;
    return out;
  }

  save(): EvolutionSave {
    return { strain: this.strain, mass: this.mass, growth: this.growth, spent: this.spent, levels: { ...this.#levels } };
  }

  static load(r: EvolutionSave): Evolution {
    const e = new Evolution(r.strain);
    e.mass = r.mass;
    e.growth = r.growth;
    e.spent = r.spent;
    for (const u of UPGRADES) e.#levels[u.id] = Math.max(0, Math.min(u.steps.length - 1, Math.floor(r.levels[u.id] ?? 0)));
    return e;
  }
}

// Every lever an upgrade names exists: a typo would leave a lever at full range unnoticed.
for (const u of UPGRADES) for (const id of u.levers ?? []) if (!LEVERS.some((v) => v.id === id)) throw new Error(`evolution: no lever "${id}"`);
