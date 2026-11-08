// The fungus's body and evolution (ja-lo8.12), pure.
//
// **Its body.** Where it lands the fungus takes root: a mycelium on the ground by the hole (Fungus.root), as
// *Metarhizium* lives for months in soil and roots without an insect (docs/fungus-body.md §1). Its mass grows on the
// substrate, logistically to what the patch can hold, and it puts out spores onto its patch at a share of its mass a
// second, paid out of that mass (design: the literature found gives no conversion). So the mycelium settles where
// growth meets sporulation, and a thicker fruiting body means more spores from a smaller mycelium.
//
// **Its evolution.** Every bit of new fungus is a chance to mutate: its mycelium growing on the ground, spores taking
// hold in an ant, load passing on by contact. So **mutations** come at a fixed share of its growth (`MUTATION`), and a
// fungus that grows fast mutates fast. Which mutations it keeps is the player's to choose: they give mutations to the
// next level of an upgrade, and each level asks more than the one before. That choosing is the game's licence (owner,
// PRD §50.13): real mutations are random and selection keeps what works, and real adaptation speeds up far less than
// replication does (docs/fungus-body.md §3). The rising costs stand in for that. The numbers are design, tuned on
// `node scripts/progression.mjs` (PRD §50.12–13).
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
  /** mutations for each level after the first: costs[k] takes it to level k + 1 */
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

/** Mutations per unit of new fungus (its growth on the ground and in hosts). */
export const MUTATION = 0.25;

/** Seconds over which the panel's mutation rate is averaged. */
const RATE_TAU = 20;

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "infectivity",
    kind: "spread",
    name: "Infectivity",
    blurb: "how fast it passes from a host to the ants it touches",
    steps: ["weak", "fair", "strong", "virulent"],
    costs: [3, 6, 3000],
    trait: "transmission",
    values: [0.12, 0.15, 0.23, 0.3],
  },
  {
    id: "persistence",
    kind: "spread",
    name: "Persistence",
    blurb: "how little of it a host clears on its own",
    steps: ["clears fast", "clears slowly", "never clears"],
    costs: [4, 800],
    trait: "decay",
    values: [0.03, 0.012, 0],
  },
  {
    id: "mycelium",
    kind: "spread",
    name: "Mycelium",
    blurb: "how much mass its patch by the hole can hold: more mass grows faster and pays for more spores",
    steps: ["a thread", "a mat", "a web"],
    costs: [2, 400],
    trait: "capacity",
    values: [30, 60, 120],
  },
  {
    id: "fruiting",
    kind: "spread",
    name: "Fruiting body",
    blurb: "how much of its mycelium it turns into spores on its patch each second, for the ants that walk through: more spores, a smaller mycelium",
    steps: ["sparse", "thick", "dense"],
    costs: [3, 500],
    trait: "spores",
    values: [0.006, 0.012, 0.02],
  },
  {
    id: "evasion",
    kind: "spread",
    name: "Immune evasion",
    blurb: "how much of the resistance grooming builds in a colony it slips past",
    steps: ["none", "some", "most"],
    costs: [2000, 6000],
    trait: "evasion",
    values: [0, 0.35, 0.7],
  },
  {
    id: "stealth",
    kind: "reach",
    name: "Stealth",
    blurb: "how well a host can hide it from its groomers (fungus showing); your aim decides whether hosts hide",
    steps: ["shows as it is", "dim", "hidden"],
    costs: [3, 600],
    levers: ["show"],
    reach: [0, 1, 2],
  },
  {
    id: "senses",
    kind: "reach",
    name: "Senses",
    blurb: "how far it bends what a host smells: food, rival trails, home, alarm, floor marks, time out",
    steps: ["one step", "the full range"],
    costs: [300],
    levers: ["food", "rival", "home", "alarm", "marks", "time"],
    reach: [1, 2],
  },
  {
    id: "recognition",
    kind: "reach",
    name: "Recognition",
    blurb: "how far it bends who a host takes for a stranger: stranger scent, a calming cue, its own odour",
    steps: ["none", "one step", "the full range"],
    costs: [10, 1500],
    levers: ["strangers", "calm", "odour"],
    reach: [0, 1, 2],
  },
  {
    id: "trails",
    kind: "reach",
    name: "Trails",
    blurb: "how far it bends what a host lays: trail, trail leaked to rivals, alarm in a fight",
    steps: ["none", "one step", "the full range"],
    costs: [10, 1500],
    levers: ["trail", "leak", "alarmLaid"],
    reach: [0, 1, 2],
  },
  {
    id: "royal",
    kind: "reach",
    name: "Royal",
    blurb: "how far it bends a queen's royal mark (queen signal): the route to new queens",
    steps: ["none", "one step", "the full range"],
    costs: [1000, 4000],
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
  /** share of the mycelium's mass it puts out as spores a second */
  spores: number;
  /** the most mass its patch holds */
  capacity: number;
}

export interface EvolutionSave {
  strain: number;
  mass: number;
  patches: number;
  growth: number;
  spent: number;
  rate: number;
  levels: Record<string, number>;
}

/** One fungus's body and evolution: the strain it evolves, its mycelium's mass, the fungus it has made, and what it has chosen. */
export class Evolution {
  /** the strain (an index into the fungus's strains) whose traits it sets: the fungus that landed */
  readonly strain: number;
  /** the mycelium's mass, over all its patches */
  mass = 0;
  /** patches it has rooted (Fungus.root: where it landed, and by each hole a queen carrying it founds) */
  patches = 0;
  /** new fungus over the game, on the ground and in hosts: what mutations come from */
  growth = 0;
  /** mutations given to upgrades */
  spent = 0;
  /** mutations a second, averaged over the last RATE_TAU seconds: what the panel shows */
  rate = 0;
  readonly #levels: Record<string, number>;

  constructor(strain: number) {
    this.strain = strain;
    this.#levels = Object.fromEntries(UPGRADES.map((u) => [u.id, 0]));
  }

  /** The level chosen of upgrade `id` (0: as the fungus starts). */
  level(id: string): number {
    return this.#levels[id] ?? 0;
  }

  /** Mutations its growth has given, kept or not (fractional: the panel shows whole ones). */
  get earned(): number {
    return MUTATION * this.growth;
  }

  /** Mutations to give. */
  get mutations(): number {
    return this.earned - this.spent;
  }

  /** Mutations the next level of `id` takes, or null when it is at its last. */
  cost(id: string): number | null {
    return upgrade(id).costs[this.level(id)] ?? null;
  }

  /** Whether the next level of `id` can be chosen now. */
  affordable(id: string): boolean {
    const c = this.cost(id);
    return c !== null && c <= this.mutations;
  }

  /** Give mutations to the next level of `id`; false (nothing given) when it is at its last or there are too few. */
  buy(id: string): boolean {
    const c = this.cost(id);
    if (c === null || c > this.mutations) return false;
    this.spent += c;
    this.#levels[id] = this.level(id) + 1;
    return true;
  }

  /** A new patch of mycelium takes root (Fungus.root): it brings its own start and room to grow. */
  root(): void {
    this.patches++;
    this.mass += BODY.start;
  }

  /**
   * dt seconds of the mycelium on its patches: it grows logistically to what they hold and puts out the fruiting body's
   * share of its mass as spores, paid out of that mass. Its growth counts toward mutations. Returns the spores put out.
   */
  grow(dt: number): number {
    if (this.patches === 0) return 0;
    const t = this.traits();
    const grown = Math.max(0, BODY.growth * this.mass * (1 - this.mass / (t.capacity * this.patches)) * dt);
    this.mass += grown;
    this.growth += grown;
    const spores = (t.spores * this.mass * dt) / BODY.sporeMass;
    this.mass -= spores * BODY.sporeMass;
    return spores;
  }

  /** Fungus grown in hosts (load they took on, from spores or by contact): it counts toward mutations. */
  replicate(load: number): void {
    this.growth += load;
  }

  /** The panel's mutation rate: `made` new fungus over the last dt seconds, averaged over about RATE_TAU seconds. */
  pace(made: number, dt: number): void {
    if (dt <= 0) return;
    const a = 1 - Math.exp(-dt / RATE_TAU);
    this.rate += a * ((MUTATION * made) / dt - this.rate);
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
    return { strain: this.strain, mass: this.mass, patches: this.patches, growth: this.growth, spent: this.spent, rate: this.rate, levels: { ...this.#levels } };
  }

  static load(r: EvolutionSave): Evolution {
    const e = new Evolution(r.strain);
    e.mass = r.mass;
    e.patches = r.patches;
    e.growth = r.growth;
    e.spent = r.spent;
    e.rate = r.rate;
    for (const u of UPGRADES) e.#levels[u.id] = Math.max(0, Math.min(u.steps.length - 1, Math.floor(r.levels[u.id] ?? 0)));
    return e;
  }
}

// Every lever an upgrade names exists: a typo would leave a lever at full range unnoticed.
for (const u of UPGRADES) for (const id of u.levers ?? []) if (!LEVERS.some((v) => v.id === id)) throw new Error(`evolution: no lever "${id}"`);
