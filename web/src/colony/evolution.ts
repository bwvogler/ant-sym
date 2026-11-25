// The fungus's body and evolution (ja-lo8.12), pure.
//
// **Its body.** Where it lands the fungus takes root: a mycelium on the ground by the hole (Fungus.root), as
// *Metarhizium* lives for months in soil and roots without an insect (docs/fungus-body.md §1). Its mass grows on the
// substrate, logistically to what the patch can hold, and it puts out spores onto its patch at a share of its mass a
// second, paid out of that mass (design: the literature found gives no conversion). So the mycelium settles where
// growth meets sporulation, and a thicker fruiting body means more spores from a smaller mycelium.
//
// **Its evolution.** Every bit of new fungus is a chance to mutate: its mycelium growing on the ground, and load
// passing on by contact in its hosts (the source keeps its load). Spores an ant picks up are fungus moved, not made:
// counted once, when the mycelium grew them. So **mutations** come at a fixed share of its growth (`MUTATION`), and a
// fungus that grows fast mutates fast. Which mutations it keeps is the player's to choose: they give mutations to the
// next level of an upgrade. That choosing is the game's licence (owner, PRD §50.13): real mutations are random and
// selection keeps what works, and real adaptation speeds up far less than replication does (docs/fungus-body.md §3).
//
// **The tree** (ja-52ui, PRD §80, docs/mutation-tree.md; design, owner 2026-11-15): some levels need levels of other
// upgrades first (`Upgrade.needs`), and every level costs one price, which rises with each level kept (`price`), so the
// tree's depth carries the pacing. The numbers are design, tuned on `node scripts/lab/progression.mjs`.
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
// what the player chooses is what takes it in. The lethal levers have upgrades too (ja-lo8.16, PRD §50.16): the player's
// menu permits one, and the upgrade frees it, so no power comes free.

import { LEVERS, type Reach } from "./levers.ts";

/** A level of another upgrade that must be kept first. */
export interface Need {
  id: string;
  level: number;
}

/** A spread trait an upgrade sets. */
export type Trait = "transmission" | "decay" | "evasion" | "spores" | "capacity" | "knots" | "stalks" | "lichen";

export interface Upgrade {
  id: string;
  kind: "spread" | "reach";
  name: string;
  /** what it does, for the panel */
  blurb: string;
  /** what each level is, in words: index 0 is where the fungus starts */
  steps: readonly string[];
  /** what each level after the first needs of other upgrades: needs[k] for level k + 1 (the level before it in this upgrade comes first anyway) */
  needs: readonly (readonly Need[])[];
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

/**
 * Mutations the ants pool starts with: enough for its first two levels (price(0) + price(1) = 1 + 2). The ants' levels
 * are what start the spread (infectivity above all), and the ants pool fills only from fungus passed between ants, which
 * needs them: without a start it stalled (M3 assay, PRD §85: infectivity at 336 s on seed 1, four seeds never reaching a
 * quarter of the colony in ten minutes); with it every seed 1–10 is at or ahead of the one-pool game.
 */
export const ANTS_START = 3;

/** Seconds over which the panel's mutation rate is averaged. */
const RATE_TAU = 20;

/** Every level costs one price, which rises with each level kept: round(base · ratio^kept) (ja-52ui, PRD §80). Owner (2026-11-15): 1, ×1.5, which held P1 on seeds 1–20; 3, ×1.38 and 2, ×1.3 did not. */
export const PRICE = { base: 1, ratio: 1.5 };

/** The price of the next level of anything, after `kept` levels have been kept. */
export function price(kept: number): number {
  return Math.round(PRICE.base * PRICE.ratio ** kept);
}

/**
 * The two pools mutations are earned and spent in (PRD §85 M3, owner 2026-11-23): `ants` for the levels that act on
 * hosts, from fungus made in them (`Evolution.replicate`); `free` for the fungus's own, from growth on the ground and
 * from corpses (`grow`, `feed`). Each pool has its own rising price, counting only its own kept levels.
 */
export const POOLS = ["ants", "free"] as const;
export type Pool = (typeof POOLS)[number];

/** The fungus's own upgrades: what its mycelium makes outside a living host. Every other upgrade is the ants'. */
const FREE_UPGRADES: ReadonlySet<string> = new Set(["mycelium", "knots", "stalks", "fruiting", "lichen"]);

/** The pool that pays for upgrade `id`. */
export function poolOf(id: string): Pool {
  return FREE_UPGRADES.has(id) ? "free" : "ants";
}

/** Mutations in hand in each pool. */
export type Pools = Readonly<Record<Pool, number>>;

/** Levels kept over the upgrades of `pool`, or over all of them when none is named. */
export function keptLevels(levels: Readonly<Record<string, number>>, pool?: Pool): number {
  let n = 0;
  for (const u of UPGRADES) if (pool === undefined || poolOf(u.id) === pool) n += levels[u.id] ?? 0;
  return n;
}

/** What the next level of `id` needs and the fungus has not kept yet (empty when nothing is missing, or at its last level). */
export function unmet(levels: Readonly<Record<string, number>>, id: string): Need[] {
  const u = upgrade(id);
  return (u.needs[levels[id] ?? 0] ?? []).filter((n) => (levels[n.id] ?? 0) < n.level);
}

/** Mutations the next level of `id` takes at these levels (its own pool's price), or null at its last level. */
export function nextCost(levels: Readonly<Record<string, number>>, id: string): number | null {
  return (levels[id] ?? 0) < upgrade(id).steps.length - 1 ? price(keptLevels(levels, poolOf(id))) : null;
}

/** The upgrades to keep, in order, so that the next level of `id` is kept with everything it needs first (the last is `id`). */
export function pathTo(levels: Readonly<Record<string, number>>, id: string): string[] {
  const at: Record<string, number> = { ...levels };
  const out: string[] = [];
  const go = (x: string) => {
    for (const n of upgrade(x).needs[at[x] ?? 0] ?? []) while ((at[n.id] ?? 0) < n.level) go(n.id);
    out.push(x);
    at[x] = (at[x] ?? 0) + 1;
  };
  go(id);
  return out;
}

/** Whether the next level of `id` can be kept now: there is one, nothing it needs is missing, and its pool holds mutations enough. */
export function canKeep(levels: Readonly<Record<string, number>>, mutations: Pools, id: string): boolean {
  const c = nextCost(levels, id);
  return c !== null && c <= mutations[poolOf(id)] && unmet(levels, id).length === 0;
}

export const UPGRADES: readonly Upgrade[] = [
  {
    id: "infectivity",
    kind: "spread",
    name: "Infectivity",
    blurb: "how fast it passes from a host to the ants it touches",
    steps: ["weak", "fair", "strong", "virulent"],
    needs: [[], [{ id: "persistence", level: 1 }], [{ id: "evasion", level: 1 }]],
    trait: "transmission",
    values: [0.12, 0.15, 0.23, 0.3],
  },
  {
    id: "persistence",
    kind: "spread",
    name: "Persistence",
    blurb: "how little of it a host clears on its own",
    steps: ["clears fast", "clears slowly", "never clears"],
    needs: [[], []],
    trait: "decay",
    values: [0.03, 0.012, 0],
  },
  {
    id: "mycelium",
    kind: "spread",
    name: "Mycelium",
    blurb: "how much mass its patch by the hole can hold: more mass grows faster and pays for more spores",
    steps: ["a thread", "a borer", "a web"],
    needs: [[], []],
    trait: "capacity",
    values: [30, 60, 120],
  },
  {
    // Knots (microsclerotia, ja-2bw.9, PRD §63.11): its value is the level hyphae.ts KNOT reads (0 none, 1 a few, 2 many).
    id: "knots",
    kind: "spread",
    name: "Knots",
    blurb: "whether starved hyphae harden into knots that digging can't cut, which fruit from their own store and sprout again",
    steps: ["none", "a few", "many"],
    needs: [[{ id: "mycelium", level: 1 }], [{ id: "mycelium", level: 2 }]],
    trait: "knots",
    values: [0, 1, 2],
  },
  {
    // Stalks (ja-2bw.10, PRD §63.12): its value is the level fungus.ts STALK reads (0 none, 1 a stalk, 2 a tall stalk).
    id: "stalks",
    kind: "spread",
    name: "Stalks",
    blurb: "whether a corpse it has colonised outside grows a stalk that spreads its spores over a ring round it",
    steps: ["none", "a stalk", "a tall stalk"],
    needs: [[{ id: "fruiting", level: 1 }], [{ id: "fruiting", level: 2 }]],
    trait: "stalks",
    values: [0, 1, 2],
  },
  {
    // A lichen partner (ja-vlla.11.3, PRD §90): its value is the level fungus.ts reads (0 none, 1 takes algae on rock).
    id: "lichen",
    kind: "spread",
    name: "Lichen",
    blurb: "whether a hypha beside an alga on rock takes it and spreads over the rock from its rim, a lichen",
    steps: ["none", "a partner"],
    needs: [[{ id: "mycelium", level: 1 }]],
    trait: "lichen",
    values: [0, 1],
  },
  {
    id: "fruiting",
    kind: "spread",
    name: "Fruiting body",
    blurb:
      "how much of its mycelium it turns into spores on its patch each second, for the ants that walk through: more spores, a smaller mycelium",
    steps: ["sparse", "thick", "dense"],
    needs: [[], []],
    trait: "spores",
    values: [0.006, 0.012, 0.02],
  },
  {
    id: "evasion",
    kind: "spread",
    name: "Immune evasion",
    blurb: "how much of the resistance grooming builds in a colony it slips past",
    steps: ["none", "some", "most"],
    needs: [[{ id: "persistence", level: 1 }], [{ id: "persistence", level: 2 }]],
    trait: "evasion",
    values: [0, 0.35, 0.7],
  },
  {
    id: "stealth",
    kind: "reach",
    name: "Stealth",
    blurb: "how well a host can hide it from its groomers (fungus showing); your aim decides whether hosts hide",
    steps: ["shows as it is", "dim", "hidden"],
    needs: [[], [{ id: "fruiting", level: 1 }]],
    levers: ["show"],
    reach: [0, 1, 2],
  },
  {
    id: "senses",
    kind: "reach",
    name: "Senses",
    blurb: "how far it bends what a host smells: food, rival trails, home, alarm, floor marks, time out",
    steps: ["one step", "the full range"],
    needs: [
      [
        { id: "recognition", level: 1 },
        { id: "trails", level: 1 },
      ],
    ],
    levers: ["food", "rival", "home", "alarm", "marks", "time"],
    reach: [1, 2],
  },
  {
    id: "recognition",
    kind: "reach",
    name: "Recognition",
    blurb: "how far it bends who a host takes for a stranger: stranger scent, a calming cue, its own odour",
    steps: ["none", "one step", "the full range"],
    needs: [[], []],
    levers: ["strangers", "calm", "odour"],
    reach: [0, 1, 2],
  },
  {
    id: "trails",
    kind: "reach",
    name: "Trails",
    blurb: "how far it bends what a host lays and how it recruits: trail, trail leaked to rivals, alarm in a fight, rouse (desert ants)",
    steps: ["none", "one step", "the full range"],
    needs: [[], []],
    levers: ["trail", "leak", "alarmLaid", "rouse"],
    reach: [0, 1, 2],
  },
  {
    id: "royal",
    kind: "reach",
    name: "Royal",
    blurb:
      "how far it bends the queen's royal mark: what she lays (queen signal) and what nurses perceive of it (queen scent): the route to new queens",
    steps: ["none", "one step", "the full range"],
    needs: [[{ id: "recognition", level: 2 }], [{ id: "trails", level: 2 }]],
    levers: ["queenSignal", "queenScent"],
    reach: [0, 1, 2],
    nest: true,
  },
  // The lethal levers (ja-lo8.16): on or off, so reach 0 holds one off and 1 frees it. The menu chip is the player's
  // permission; the upgrade is the fungus's power to act on it. Until then a lethal lever on the menu runs as is.
  {
    id: "weapon",
    kind: "reach",
    name: "Odour weapon",
    blurb:
      "whether a host can smell like nobody's, so its own colony and the others kill it (odour weapon, lethal): only once it is on the menu",
    steps: ["held off", "free"],
    needs: [[{ id: "infectivity", level: 2 }]],
    levers: ["weapon"],
    reach: [0, 1],
  },
  {
    id: "crown",
    kind: "reach",
    name: "Crown",
    blurb: "whether a host can kill the queen and the brood it tends, orphaning the colony (crown, lethal): only once it is on the menu",
    steps: ["held off", "free"],
    needs: [
      [
        { id: "royal", level: 2 },
        { id: "weapon", level: 1 },
      ],
    ],
    levers: ["crown"],
    reach: [0, 1],
    nest: true,
  },
];

/** The upgrade that widens lever `id` (every lever has one, ja-lo8.16). */
export function upgradeFor(lever: string): Upgrade | undefined {
  return UPGRADES.find((u) => u.levers?.includes(lever));
}

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
  /** the Knots level (hyphae.ts KNOT): 0 none, 1 a few, 2 many */
  knots: number;
  /** the Stalks level (fungus.ts STALK): 0 none, 1 a stalk, 2 a tall stalk */
  stalks: number;
  /** the Lichen level (fungus.ts): 0 none, 1 a partner */
  lichen: number;
}

export interface EvolutionSave {
  strain: number;
  mass: number;
  patches: number;
  growth: number;
  spent: number;
  rate: number;
  levels: Record<string, number>;
  /** the part of `growth` made on the ground and from corpses, and of `spent` paid from that pool (PRD §85 M3); absent when 0 */
  ground?: number;
  spentFree?: number;
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
  /** the part of `growth` made on the ground and from corpses (`grow`, `feed`): what the free pool's mutations come from; the rest was made in hosts */
  ground = 0;
  /** mutations given to upgrades, over both pools */
  spent = 0;
  /** the part of `spent` paid from the free pool */
  spentFree = 0;
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
    return ANTS_START + MUTATION * this.growth;
  }

  /** Mutations to give, over both pools. */
  get mutations(): number {
    return this.earned - this.spent;
  }

  /** Mutations to give in each pool: the ants' from fungus made in hosts, the free pool's from the ground and corpses. */
  get pools(): Pools {
    return {
      ants: ANTS_START + MUTATION * (this.growth - this.ground) - (this.spent - this.spentFree),
      free: MUTATION * this.ground - this.spentFree,
    };
  }

  /** Mutations the next level of `id` takes, or null when it is at its last. */
  cost(id: string): number | null {
    return nextCost(this.#levels, id);
  }

  /** What the next level of `id` needs and has not been kept (empty: nothing missing). */
  locked(id: string): Need[] {
    return unmet(this.#levels, id);
  }

  /** Whether the next level of `id` can be chosen now. */
  affordable(id: string): boolean {
    return canKeep(this.#levels, this.pools, id);
  }

  /** Give mutations to the next level of `id`; false (nothing given) when it is at its last, locked, or there are too few. */
  buy(id: string): boolean {
    const c = this.cost(id);
    const pool = poolOf(id);
    if (c === null || c > this.pools[pool] || this.locked(id).length > 0) return false;
    this.spent += c;
    if (pool === "free") this.spentFree += c;
    this.#levels[id] = this.level(id) + 1;
    return true;
  }

  /** A new patch of mycelium takes root (Fungus.root): it brings its own start and room to grow. */
  root(): void {
    this.patches++;
    this.mass += BODY.start;
  }

  /**
   * A flower of hyphae becomes a patch (Fungus.settle, PRD §85): room to grow, but no start of its own: its middle
   * cell's mass is the hyphae's already, so the body's mass is unchanged.
   */
  settle(): void {
    this.patches++;
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
    this.ground += grown;
    const spores = (t.spores * this.mass * dt) / BODY.sporeMass;
    this.mass -= spores * BODY.sporeMass;
    return spores;
  }

  /** Spores its patch could not hold go back into the mycelium's mass. */
  refund(spores: number): void {
    this.mass += spores * BODY.sporeMass;
  }

  /** Hypha cut and lost (ja-2bw.4: ants digging through it): the mass it held is gone. */
  lose(mass: number): void {
    this.mass = Math.max(0, this.mass - mass);
  }

  /** A corpse it grows out of (ja-2bw.7): the cadaver's substance joins the mycelium, as new fungus that counts toward mutations. */
  feed(mass: number): void {
    this.mass += mass;
    this.growth += mass;
    this.ground += mass;
  }

  /** Growth from light (a lichen's alga, PRD §90 L2): it counts toward the free pool's mutations, but adds no mass. */
  light(growth: number): void {
    this.growth += growth;
    this.ground += growth;
  }

  /** Fungus grown in hosts (load passed on by contact): it counts toward mutations. */
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
    const out: Traits = { transmission: 0, decay: 0, evasion: 0, spores: 0, capacity: 0, knots: 0, stalks: 0, lichen: 0 };
    for (const u of UPGRADES) if (u.trait && u.values) out[u.trait] = u.values[this.level(u.id)];
    return out;
  }

  /** Each lever's reach at the levels chosen. Every lever has one (a test pins it), the lethal ones included (ja-lo8.16). */
  reach(): Reach {
    const out: Record<string, number> = {};
    for (const u of UPGRADES) if (u.levers && u.reach) for (const id of u.levers) out[id] = u.reach[this.level(u.id)];
    return out;
  }

  save(): EvolutionSave {
    return {
      strain: this.strain,
      mass: this.mass,
      patches: this.patches,
      growth: this.growth,
      spent: this.spent,
      rate: this.rate,
      levels: { ...this.#levels },
      // The free pool's share, only once there is one: an evolution that never grew on the ground saves as it did with one pool.
      ...(this.ground > 0 ? { ground: this.ground } : {}),
      ...(this.spentFree > 0 ? { spentFree: this.spentFree } : {}),
    };
  }

  static load(r: EvolutionSave): Evolution {
    const e = new Evolution(r.strain);
    e.mass = r.mass;
    e.patches = r.patches;
    e.growth = r.growth;
    e.spent = r.spent;
    // A save from the one-pool days has neither: every mutation it earned counts as the ants' (its kept free levels stay kept).
    e.ground = r.ground ?? 0;
    e.spentFree = r.spentFree ?? 0;
    e.rate = r.rate;
    for (const u of UPGRADES) e.#levels[u.id] = Math.max(0, Math.min(u.steps.length - 1, Math.floor(r.levels[u.id] ?? 0)));
    return e;
  }
}

// Every lever an upgrade names exists: a typo would leave a lever at full range unnoticed.
for (const u of UPGRADES)
  for (const id of u.levers ?? []) if (!LEVERS.some((v) => v.id === id)) throw new Error(`evolution: no lever "${id}"`);

/**
 * Check that a table of upgrades holds together as a tree (ja-52ui): each level lists what it needs, every need is a real
 * level of another upgrade, and keeping whatever can be kept reaches every level, so there is no cycle and no level out
 * of reach. Throws on the first fault; run on UPGRADES at load.
 */
export function checkTree(upgrades: readonly Upgrade[]): void {
  const levels: Record<string, number> = {};
  const unmetIn = (id: string) => {
    const u = upgrades.find((x) => x.id === id)!;
    return (u.needs[levels[id] ?? 0] ?? []).filter((n) => (levels[n.id] ?? 0) < n.level);
  };
  for (const u of upgrades) {
    levels[u.id] = 0;
    if (u.needs.length !== u.steps.length - 1)
      throw new Error(`evolution: ${u.id} lists needs for ${u.needs.length} levels, not ${u.steps.length - 1}`);
    for (const ns of u.needs)
      for (const n of ns) {
        const v = upgrades.find((x) => x.id === n.id);
        if (!v || n.id === u.id || n.level < 1 || n.level >= v.steps.length)
          throw new Error(`evolution: ${u.id} needs no such level ${n.id} ${n.level}`);
      }
  }
  for (let moved = true; moved;) {
    moved = false;
    for (const u of upgrades)
      if (levels[u.id]! < u.steps.length - 1 && unmetIn(u.id).length === 0) {
        levels[u.id]!++;
        moved = true;
      }
  }
  for (const u of upgrades) if (levels[u.id] !== u.steps.length - 1) throw new Error(`evolution: ${u.id} can't reach its last level`);
}
checkTree(UPGRADES);
