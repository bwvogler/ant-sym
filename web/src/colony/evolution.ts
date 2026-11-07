// The fungus's evolution (ja-lo8.12), pure. In the game the fungus starts weak: it spreads slowly, clears from a host
// on its own, nestmates groom it out of a crowded nest, and its levers barely move. It grows biomass from the load its
// hosts carry and spends it on two kinds of upgrade:
//
// - **Spread**, its body: infectivity (the strain's transmission), persistence (how little it clears on its own) and
//   immune evasion (how much of a host's primed resistance it slips past).
// - **Reach**, its hold on the host: how far from "as is" each group of levers may go (levers.hold). Jev is still asked
//   every lever on its full scale and its answers are cached that way; reach acts only where levels take effect, so an
//   upgrade re-asks nothing and costs no tokens.
//
// The numbers are tuned on `node scripts/progression.mjs` (PRD §49.11): the start must lose to grooming in the nest
// (transmission under what four groomers take off a visible host), so that what the player buys is what takes it in.
// Lethal levers are not here: the player's menu still gates them (PRD §49).

import { LEVERS, type Reach } from "./levers.ts";

/** A spread trait an upgrade sets on the fungus's strain. */
export type Trait = "transmission" | "decay" | "evasion" | "spores";

export interface Upgrade {
  id: string;
  kind: "spread" | "reach";
  name: string;
  /** what it does, for the panel */
  blurb: string;
  /** what each level is, in words: index 0 is where the fungus starts */
  steps: readonly string[];
  /** biomass for each level after the first: costs[k] buys level k + 1 */
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

/** Biomass the fungus grows per second per unit of load in its hosts (a host fully loaded grows this much a second). */
export const INCOME = 0.1;

/**
 * Biomass its base grows per second on its own, feeding on the ground it landed on (design): a floor under the income
 * by a hole few ants walk through, so the first upgrade never waits on traffic alone.
 */
export const BASE_INCOME = 0.25;

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "infectivity",
    kind: "spread",
    name: "Infectivity",
    blurb: "how fast it passes from a host to the ants it touches",
    steps: ["weak", "fair", "strong", "virulent"],
    costs: [30, 150, 5000],
    trait: "transmission",
    values: [0.12, 0.15, 0.23, 0.3],
  },
  {
    id: "persistence",
    kind: "spread",
    name: "Persistence",
    blurb: "how little of it a host clears on its own",
    steps: ["clears fast", "clears slowly", "never clears"],
    costs: [40, 1500],
    trait: "decay",
    values: [0.03, 0.012, 0],
  },
  {
    id: "fruiting",
    kind: "spread",
    name: "Fruiting body",
    blurb: "how many spores its base by the hole keeps on the ground, for the ants that walk through",
    steps: ["sparse", "thick", "dense"],
    costs: [25, 400],
    trait: "spores",
    values: [0.15, 0.35, 0.7],
  },
  {
    id: "evasion",
    kind: "spread",
    name: "Immune evasion",
    blurb: "how much of the resistance grooming builds in a colony it slips past",
    steps: ["none", "some", "most"],
    costs: [3000, 15000],
    trait: "evasion",
    values: [0, 0.35, 0.7],
  },
  {
    id: "stealth",
    kind: "reach",
    name: "Stealth",
    blurb: "how well a host can hide it from its groomers (fungus showing)",
    steps: ["shows as it is", "dim", "hidden"],
    costs: [35, 900],
    levers: ["show"],
    reach: [0, 1, 2],
  },
  {
    id: "senses",
    kind: "reach",
    name: "Senses",
    blurb: "how far it bends what a host smells: food, rival trails, home, alarm, floor marks, time out",
    steps: ["one step", "the full range"],
    costs: [800],
    levers: ["food", "rival", "home", "alarm", "marks", "time"],
    reach: [1, 2],
  },
  {
    id: "recognition",
    kind: "reach",
    name: "Recognition",
    blurb: "how far it bends who a host takes for a stranger: stranger scent, a calming cue, its own odour",
    steps: ["none", "one step", "the full range"],
    costs: [150, 4000],
    levers: ["strangers", "calm", "odour"],
    reach: [0, 1, 2],
  },
  {
    id: "trails",
    kind: "reach",
    name: "Trails",
    blurb: "how far it bends what a host lays: trail, trail leaked to rivals, alarm in a fight",
    steps: ["none", "one step", "the full range"],
    costs: [150, 4000],
    levers: ["trail", "leak", "alarmLaid"],
    reach: [0, 1, 2],
  },
  {
    id: "royal",
    kind: "reach",
    name: "Royal",
    blurb: "how far it bends a queen's royal mark (queen signal): the route to new queens",
    steps: ["none", "one step", "the full range"],
    costs: [2500, 12000],
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

/** The spread traits at a set of levels. */
export interface Traits {
  transmission: number;
  decay: number;
  /** share of a host's primed resistance the fungus slips past (0: none) */
  evasion: number;
  /** the least spores its base keeps on each of its cells (Fungus.root) */
  spores: number;
}

export interface EvolutionSave {
  strain: number;
  biomass: number;
  earned: number;
  levels: Record<string, number>;
}

/** One fungus's evolution: the strain it evolves, the biomass it has, and the level it has bought of each upgrade. */
export class Evolution {
  /** the strain (an index into the fungus's strains) whose traits it sets: the fungus that landed */
  readonly strain: number;
  biomass = 0;
  /** biomass grown over the whole game */
  earned = 0;
  readonly #levels: Record<string, number>;

  constructor(strain: number) {
    this.strain = strain;
    this.#levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  }

  /** The level bought of upgrade `id` (0: as the fungus starts). */
  level(id: string): number {
    return this.#levels[id] ?? 0;
  }

  /** What the next level of `id` costs, or null when it is at its last. */
  cost(id: string): number | null {
    return upgrade(id).costs[this.level(id)] ?? null;
  }

  /** Whether the next level of `id` can be bought now. */
  affordable(id: string): boolean {
    const c = this.cost(id);
    return c !== null && c <= this.biomass;
  }

  /** Buy the next level of `id`; false (and nothing spent) when it is at its last or there is not the biomass. */
  buy(id: string): boolean {
    const c = this.cost(id);
    if (c === null || c > this.biomass) return false;
    this.biomass -= c;
    this.#levels[id] = this.level(id) + 1;
    return true;
  }

  /**
   * Grow from `loadSeconds` (the load in the fungus's hosts, summed, times the seconds it was carried) and from
   * `rooted` seconds of its base feeding on its own.
   */
  grow(loadSeconds: number, rooted = 0): void {
    const b = INCOME * loadSeconds + BASE_INCOME * rooted;
    this.biomass += b;
    this.earned += b;
  }

  /** The spread traits at the levels bought. */
  traits(): Traits {
    const out: Traits = { transmission: 0, decay: 0, evasion: 0, spores: 0 };
    for (const u of UPGRADES) if (u.trait && u.values) out[u.trait] = u.values[this.level(u.id)] as number;
    return out;
  }

  /** Each lever's reach at the levels bought; levers no upgrade names (the lethal ones) keep their full range. */
  reach(): Reach {
    const out: Record<string, number> = {};
    for (const u of UPGRADES) if (u.levers && u.reach) for (const id of u.levers) out[id] = u.reach[this.level(u.id)] as number;
    return out;
  }

  save(): EvolutionSave {
    return { strain: this.strain, biomass: this.biomass, earned: this.earned, levels: { ...this.#levels } };
  }

  static load(r: EvolutionSave): Evolution {
    const e = new Evolution(r.strain);
    e.biomass = r.biomass;
    e.earned = r.earned;
    for (const u of UPGRADES) e.#levels[u.id] = Math.max(0, Math.min(u.steps.length - 1, Math.floor(r.levels[u.id] ?? 0)));
    return e;
  }
}

// Every lever an upgrade names exists: a typo would leave a lever at full range unnoticed.
for (const u of UPGRADES) for (const id of u.levers ?? []) if (!LEVERS.some((v) => v.id === id)) throw new Error(`evolution: no lever "${id}"`);
