import {
  type ChapterView,
  type Colony,
  chapterOf,
  type Fungus,
  type Game,
  type Mode,
  type Outcome,
  type Stance,
  type Unity,
  UPGRADES,
} from "../colony/index.ts";
import { landingOf } from "./landing.ts";
import { colonyName } from "./names.ts";

// What the panels read off the game (ja-fnd.6.1, docs/refactor.md S5.1): the stats the loop takes every 150 ms, and the plain
// functions that compute them. The loop (gameLoop.ts) keeps the latest; no React in here.

/** One colony's line in the panel. */
export interface SideStats {
  population: number;
  cap: number;
  stored: number;
  losses: number;
  births: number;
  /** nest slice 4 (the side view): the queen ("lost": orphaned), and brood as eggs / larvae / pupae; null on the top-down maps */
  queen: "alive" | "lost" | null;
  /** the fungus in the queen, 0..1 (ja-lo8.7) */
  queenLoad: number;
  brood: [number, number, number];
  /** brood killed by the fungus's crown (nest slice 8) */
  broodKilled: number;
  /** each ant's stance is its own (docs/stance.md): how many defend and raid */
  stance: string;
  /** share of living ants carrying the fungus */
  infected: number;
  /** mean resistance (immune priming) over living ants */
  resist: number;
  /** soil cells dug */
  dug: number;
  /** pellets of it brought out to the mound */
  mound: number;
  /** pellets of it put back into unused space underground: dug = mound + filled + pellets in jaws + pellets lost with ants that died */
  filled: number;
  /** the side view: loose pellets taken off the mound and put back underground (soil already counted on the mound, moved again) */
  refilled: number;
}

export interface ColonyStats {
  time: number;
  stored: number;
  foodTotal: number;
  foodLeft: number;
  counts: Record<Mode, number>;
  /** policy mode choices per second, over the last second */
  choicesPerSecond: number;
  situationsSeen: number;
  /** every situation the colonies' mode lane can be asked in: the species' own schema's size, or SITUATIONS (ja-fnd.5.12) */
  situations: number;
  /** every colony's line: Game.colonies order (Ink, then Amber; ui/names.ts) */
  sides: SideStats[];
  /** the colony that is gone, by index, or −1 */
  fallen: number;
  outcome: Outcome;
  /** cells of ground holding spores enough to see (Fungus.shownSporeCells) */
  sporeCells: number;
  /** how far the fungus has come toward one colony */
  unity: Unity;
  /** sim seconds per wall second over the last second: below the speed asked when the machine can't keep up */
  pace: number;
  /** where the player stands (chapters.ts) */
  chapter: ChapterView;
  /** new queens flown and waiting to found (Game.flights): the game pauses for them (ja-lo8.9) */
  flights: number;
  /** the game's fungus's body and evolution (ja-lo8.12); null before it lands (a game built without Game.land's evolve, as tests do, has none) */
  evolution: EvolutionStats | null;
}

/** The fungus's body and evolution, for its panel. */
export interface EvolutionStats {
  /** its mycelium's mass by the hole */
  mass: number;
  /** the load in its hosts, summed over every colony's ants and queens */
  inHosts: number;
  /** mutations to give (whole ones), and how many it makes a minute now: it mutates as fast as it grows */
  mutations: number;
  /** the same, by pool (PRD §85 M3): the ants' from fungus made in hosts, the free pool's from the ground and corpses */
  pools: { ants: number; free: number };
  perMinute: number;
  /** the level chosen of each upgrade, by id */
  levels: Record<string, number>;
}

/** The game's fungus's body and evolution, read off the game. */
function evolutionStats(game: Game): EvolutionStats | null {
  const e = game.fungus.evolution;
  if (!e) return null;
  let inHosts = 0;
  for (const c of game.colonies) {
    for (let i = 0; i < c.n; i++) if (c.alive[i] && c.strain[i] === e.strain) inHosts += c.load[i];
    if (c.queen?.alive && c.queen.strain === e.strain) inHosts += c.queen.load;
  }
  return {
    mass: e.mass,
    inHosts,
    mutations: Math.floor(e.mutations),
    pools: { ants: Math.floor(e.pools.ants), free: Math.floor(e.pools.free) },
    perMinute: 60 * e.rate,
    levels: Object.fromEntries(UPGRADES.map((u) => [u.id, e.level(u.id)])),
  };
}

/** Ants in each mode, over every colony. */
function sumCounts(colonies: readonly Colony[]): Record<Mode, number> {
  const out = { explore: 0, follow: 0, return: 0, fight: 0 } as Record<Mode, number>;
  for (const c of colonies) for (const [m, n] of Object.entries(c.counts()) as [Mode, number][]) out[m] += n;
  return out;
}

/** Every situation the colonies' mode lane can be asked in: the species' own schema's size (Colony.seen is sized by it), or SITUATIONS. */
export function situationsOf(colonies: readonly Colony[]): number {
  return colonies[0]?.seen.length ?? 0;
}

/** Situations any colony has been asked in: what one shared doctrine would pay for (the caches are shared by context). */
function seenTogether(colonies: readonly Colony[]): number {
  let n = 0;
  const first = colonies[0];
  if (!first) return 0;
  for (let k = 0; k < first.seen.length; k++) if (colonies.some((c) => c.seen[k])) n++;
  return n;
}

function side(c: Colony, fungus: Fungus): SideStats {
  const f = fungus.census(c);
  return {
    population: c.population,
    cap: c.params.maxAnts,
    stored: c.stored,
    losses: c.losses,
    births: c.births,
    queen: c.queen ? (c.queen.alive ? "alive" : "lost") : null,
    queenLoad: c.queen?.load ?? 0,
    brood: c.brood.counts(),
    broodKilled: c.broodKilled,
    stance: stanceText(c.stanceCounts()),
    infected: f.living ? f.infected / f.living : 0,
    resist: f.meanResist,
    dug: c.soilDug,
    mound: c.soilOut,
    filled: c.soilFilled,
    refilled: c.looseFilled,
  };
}

/** The chapter for a game: the colony the fungus landed by (or would land by), and how far into it it is. */
function chapterFor(game: Game): ChapterView {
  const k = landingOf(game);
  const c = game.colonies[k] ?? game.colonies[0]!;
  const f = game.fungus.census(c);
  const line = game.lineage(k);
  const gynes = line.reduce((n, j) => n + (game.colonies[j]?.gynes ?? 0), 0);
  const daughters = line.length - 1;
  return chapterOf({
    landed: game.landed !== null,
    colony: colonyName(k),
    hosts: f.infected,
    share: f.living ? f.infected / f.living : 0,
    queenInfected: game.revealed[k] === true,
    gynes,
    daughters,
  });
}

/** Each ant's own stance, counted: "3 defend · 12 raid", or "all forage". */
function stanceText(n: Record<Stance, number>): string {
  return n.defend || n.raid ? `${n.defend} defend · ${n.raid} raid` : "all forage";
}

/** The stats panel's numbers, read off the game now: `rate` is the policy's mode choices a second, `pace` the sim seconds a wall second. */
export function statsOf(game: Game, rate: number, pace: number): ColonyStats {
  return {
    time: game.time,
    stored: game.colonies.reduce((n, c) => n + c.stored, 0),
    // One world: both layers' food, as Game.foodLeft counts it (the plane's and the curtain's buried food).
    foodTotal: game.world.plane.foodTotal + game.world.curtain.foodTotal,
    foodLeft: game.foodLeft,
    counts: sumCounts(game.colonies),
    choicesPerSecond: rate,
    situationsSeen: seenTogether(game.colonies),
    situations: situationsOf(game.colonies),
    sides: game.colonies.map((c) => side(c, game.fungus)),
    fallen: game.fallen(),
    outcome: game.outcome(),
    sporeCells: game.fungus.shownSporeCells,
    unity: game.unity(),
    pace,
    chapter: chapterFor(game),
    flights: game.flights.length,
    evolution: evolutionStats(game),
  };
}

/** The mode choices every colony has made: the whole map's (no colony is the player's). */
export const decisionsOf = (game: Game): number => game.colonies.reduce((n, c) => n + c.decisions, 0);
