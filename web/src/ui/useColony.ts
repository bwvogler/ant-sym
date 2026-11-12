import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Colony,
  type Mode,
  type Stance,
  DEFAULT_MENU,
  STRAINS,
  type Fungus,
  Game,
  GAME_REGROW,
  gameRng,
  type Outcome,
  type Unity,
  chapterOf,
  type ChapterView,
  UPGRADES,
  generateOneWorld,
} from "../colony/index.ts";
import { journalFromUrl } from "./journal.ts";
import { colonyName } from "./names.ts";
import { pushToast } from "./toasts.ts";
import type { GameSettings, SaveRecord } from "./saves.ts";

// Owns the one Game (its colonies and the fungus, the player) and its animation
// loop: React state carries only what the
// panel shows, the renderer reads the colonies' typed arrays every frame. A
// new seed, ant count or rival setting is a new game on a fresh map.

// No brush: the fungus works through its hosts, not the player's hand. The lure and alarm brushes went in ja-lo8.2
// (they painted only the first colony's fields); the spore brush went in ja-260, since every game lands an evolving
// fungus and a free stroke skipped its progression. Game.paintSpores (and its BRUSH stroke) stays for tests and scripts.

export interface ColonyControls {
  seed: number;
  antCount: number;
  speed: number;
  playing: boolean;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  /** the fungus's menu: the levers the player has on (§5.1, lever 4; levers.ts) */
  menu: string[];
  /** the local rule's settings: hide groomed hosts; cull high-load fighters among strangers */
  hide: boolean;
  cull: boolean;
  /** a rival colony at the map's second nest */
  rival: boolean;
  /** one world's view: the plane from above, or the curtain below; a camera switch, not a new game (it is no build input) */
  view: View;
  /** the player pressed Start (the start screen, ja-lo8.5): every game from then on begins with the fungus landing */
  started: boolean;
}

/** One world's two views (docs/one-world.md §5): "above" the plane, "below" the curtain under the line. */
export type View = "above" | "below";

/** The game's default speed (owner, PRD §50: faster by default, every rate scaled together; no sim constant changes). */
export const GAME_SPEED = 4;
/** The top speed the controls offer. */
export const MAX_SPEED = 8;
/** The game's fungus: one species, the player's, which spreads like Garden (PRD §50; the other strains are lab presets). */
export const GAME_STRAIN = STRAINS.findIndex((s) => s.id === "garden");
/** The colony the fungus lands by. */
export const LANDING_COLONY = 0;

export const DEFAULT_COLONY_CONTROLS: ColonyControls = {
  seed: 1,
  antCount: 600,
  speed: GAME_SPEED,
  playing: false,
  started: false,
  showFoodTrail: true,
  showHomeTrail: false,
  menu: [...DEFAULT_MENU],
  hide: false,
  cull: false,
  rival: true,
  view: "above",
};

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
  /** the colony's stance; where each ant's is its own (top-down, docs/stance.md), how many defend and raid */
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
  /** every colony's line: Game.colonies order (Ink, then Amber; ui/names.ts) */
  sides: SideStats[];
  /** the colony that is gone, by index, or −1 */
  fallen: number;
  outcome: Outcome;
  /** cells of ground holding spores */
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
    stance: c.ownStances ? stanceText(c.stanceCounts()) : c.stance,
    infected: f.living ? f.infected / f.living : 0,
    resist: f.meanResist,
    dug: c.soilDug,
    mound: c.soilOut,
    filled: c.soilFilled,
    refilled: c.looseFilled,
  };
}

/** A game as the page builds it from its settings: a fresh world, nothing played (a save is poured in with Game.load). */
export function buildGame(s: GameSettings): Game {
  // The page plays one world only (owner, 2026-11-10; PRD §55): the side and open maps stay for the assays and scripts.
  // Its fungus grows as hyphae (ja-2bw, PRD §63): they fruit where they reach a tunnel, and its dead hosts are new starts.
  const map = generateOneWorld(s.seed);
  return new Game(
    map,
    { antCount: s.antCount, rivalAnts: s.antCount, rival: s.rival, regrow: GAME_REGROW, autoFound: false, fungus: { hyphae: true } },
    gameRng(s.seed, s.generation),
  );
}

/** Longest single sim step: sensing a trail 3 cells ahead needs steps well under a cell. */
const MAX_STEP = 1 / 30;

export function useColony(initial: ColonyControls = DEFAULT_COLONY_CONTROLS) {
  const [controls, setControls] = useState<ColonyControls>(initial);
  // The game journal, when the URL asks for one (?log=, ui/journal.ts): it outlives games, and starts afresh on each.
  const journal = useMemo(() => journalFromUrl(), []);
  // Bumped by Restart: the same seed again, from scratch.
  const [generation, setGeneration] = useState(0);
  // A saved game to pour into the next game built (loadSave): built from its own settings, then restored (save.ts).
  const pending = useRef<SaveRecord | null>(null);
  const [loads, setLoads] = useState(0);
  const game = useMemo(() => {
    const build = () => buildGame({ seed: controls.seed, antCount: controls.antCount, rival: controls.rival, generation });
    const g = build();
    const r = pending.current;
    if (
      r &&
      r.settings.seed === controls.seed &&
      r.settings.antCount === controls.antCount &&
      r.settings.rival === controls.rival &&
      r.settings.generation === generation
    ) {
      pending.current = null;
      try {
        g.load(r.game);
      } catch (e) {
        // A save this game can't read (another version, another shape): a fresh game of the same world rather than a
        // blank page (PR #42 review, B3). The notice waits until React has finished rendering.
        queueMicrotask(() =>
          pushToast(
            `That save couldn't be loaded (${e instanceof Error ? e.message : String(e)}); this is a fresh game of its world.`,
            "warn",
          ),
        );
        return build();
      }
    }
    return g;
    // `loads` rebuilds the game when a save has the same settings as the game now. `view` is not here: one world's two
    // views are one game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls.seed, controls.antCount, controls.rival, generation, loads]);
  const colony = game.player;
  // The player's policy settings outlive a game: apply them to every new one's fungus.
  useEffect(() => {
    game.fungus.configure({ hide: controls.hide, cull: controls.cull }, controls.menu);
  }, [game, controls.hide, controls.cull, controls.menu]);
  const [stats, setStats] = useState<ColonyStats | null>(null);
  const [fps, setFps] = useState(0);
  const frameListeners = useRef(new Set<() => void>());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastStats = 0;
    let frames = 0;
    let fpsAt = last;
    // The summary is the whole map's: every colony's (no colony is the player's).
    const decisions = () => game.colonies.reduce((n, c) => n + c.decisions, 0);
    let rateAt = { t: colony.time, decisions: decisions() };
    let rate = 0;
    let paceAt = { wall: performance.now(), sim: game.time };
    let pace = controls.playing ? controls.speed : 0;
    const loop = (t: number) => {
      // Clamped both ways: a first frame stamped before `last` would step the sim backwards (negative trail).
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;
      if (controls.playing) {
        const total = dt * controls.speed;
        const steps = Math.max(1, Math.ceil(total / MAX_STEP));
        for (let k = 0; k < steps; k++) {
          game.tick(total / steps);
          journal?.observe(game);
          // A new queen has flown (ja-lo8.9): the game waits for the page to found her (the queen's pen, or her mother's words).
          if (game.flights.length) {
            setControls((c) => ({ ...c, playing: false }));
            lastStats = 0;
            break;
          }
        }
      }
      if (t - paceAt.wall >= 1000) {
        pace = ((game.time - paceAt.sim) * 1000) / (t - paceAt.wall);
        paceAt = { wall: t, sim: game.time };
      }
      if (colony.time - rateAt.t >= 1) {
        rate = (decisions() - rateAt.decisions) / (colony.time - rateAt.t);
        rateAt = { t: colony.time, decisions: decisions() };
      }
      if (t - lastStats > 150) {
        setStats({
          time: colony.time,
          stored: game.colonies.reduce((n, c) => n + c.stored, 0),
          // One world: both layers' food, as colony.foodLeft counts it (the plane's and the curtain's buried food).
          foodTotal: game.world ? game.world.plane.foodTotal + game.world.curtain.foodTotal : colony.map.foodTotal,
          foodLeft: colony.foodLeft,
          counts: sumCounts(game.colonies),
          choicesPerSecond: rate,
          situationsSeen: seenTogether(game.colonies),
          sides: game.colonies.map((c) => side(c, game.fungus)),
          fallen: game.fallen(),
          outcome: game.outcome(),
          sporeCells: game.fungus.sporeCells,
          unity: game.unity(),
          pace,
          chapter: chapterFor(game),
          flights: game.flights.length,
          evolution: evolutionStats(game),
        });
        lastStats = t;
      }
      frames++;
      if (t - fpsAt > 1000) {
        setFps(frames);
        frames = 0;
        fpsAt = t;
      }
      for (const fn of frameListeners.current) fn();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [game, colony, controls.playing, controls.speed, journal]);

  // The dev hook (window.jevAnts, the game and the page's views) is the page's: ColonyApp.
  // Once the player has pressed Start, every game begins with the fungus landing by the first colony's hole.
  useEffect(() => {
    if (controls.started && !game.landed) game.land(LANDING_COLONY, GAME_STRAIN, { evolve: true });
  }, [game, controls.started]);
  /** A saved game, as it was: its world and settings, then its state (Game.load), playing. The player's state is the page's to put back. */
  const loadSave = useCallback((r: SaveRecord) => {
    pending.current = r;
    setGeneration(r.settings.generation);
    setControls((c) => ({
      ...c,
      seed: r.settings.seed,
      antCount: r.settings.antCount,
      rival: r.settings.rival,
      started: true,
      playing: true,
    }));
    setLoads((n) => n + 1);
  }, []);
  /** What builds this game again (saves.ts). */
  const settings: GameSettings = { seed: controls.seed, antCount: controls.antCount, rival: controls.rival, generation };

  /** The start screen's Start: this seed, the fungus lands; playing at the game's speed, or paused at 1× for the tutorial (PRD §61). */
  const start = useCallback(
    (seed: number, tutorial = false) =>
      setControls((c) => ({
        ...c,
        seed: Math.max(1, Math.floor(seed) || 1),
        started: true,
        playing: !tutorial,
        speed: tutorial ? 1 : GAME_SPEED,
      })),
    [],
  );

  const onFrame = useCallback((fn: () => void) => {
    frameListeners.current.add(fn);
    return () => void frameListeners.current.delete(fn);
  }, []);
  const update = useCallback((patch: Partial<ColonyControls>) => setControls((c) => ({ ...c, ...patch })), []);
  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const newWorld = useCallback(() => setControls((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99_999) })), []);
  /** Give adaptations to the next level of upgrade `id` (evolution.UPGRADES); false when the fungus can't. */
  const evolve = useCallback((id: string) => game.fungus.upgrade(id), [game]);

  return { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, start, loadSave, settings, evolve, journal };
}

/** The chapter for a game: the colony the fungus landed by (or would land by), and how far into it it is. */
function chapterFor(game: Game): ChapterView {
  const k = game.landed?.colony ?? LANDING_COLONY;
  const c = game.colonies[k] ?? game.player;
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

/** Each ant's own stance, counted (top-down): "3 defend · 12 raid", or "all forage". */
function stanceText(n: Record<Stance, number>): string {
  return n.defend || n.raid ? `${n.defend} defend · ${n.raid} raid` : "all forage";
}
