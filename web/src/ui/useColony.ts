import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_MENU,
  menuFor,
  SPECIES,
  DEFAULT_COLONY,
  STRAINS,
  Game,
  GAME_REGROW,
  gameRng,
  generateOneWorld,
  GENERIC_ANT,
  speciesById,
} from "../colony/index.ts";
import { journalFromUrl } from "./journal.ts";
import { pushToast } from "./toasts.ts";
import type { GameSettings, SaveRecord } from "./saves.ts";
import { landingOf } from "./landing.ts";
import { GameLoop, MAX_STEP } from "./gameLoop.ts";
import type { ColonyStats, EvolutionStats, SideStats } from "./stats.ts";

// The stats types and situationsOf live in stats.ts; they are re-exported here, where the page and its tests have always read them.
export type { ColonyStats, EvolutionStats, SideStats };
export { situationsOf } from "./stats.ts";

// Owns the one Game (its colonies and the fungus, the player) and its animation
// loop: React state carries only what the
// panel shows, the renderer reads the colonies' typed arrays every frame. A
// new seed, ant count or rival setting is a new game on a fresh map.

// No brush: the fungus works through its hosts, not the player's hand. The lure and alarm brushes went in ja-lo8.2
// (they painted only the first colony's fields); the spore brush went in ja-260, since every game lands an evolving
// fungus and a free stroke skipped its progression. Game.paintSpores (and its BRUSH stroke) stays for tests and scripts.

export interface ColonyControls {
  /** the species both colonies are (Species.id: colony/species.ts SPECIES); chosen on the start screen (ja-rf5) */
  species: string;
  seed: number;
  antCount: number;
  speed: number;
  playing: boolean;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  /** the fungus's menu: the levers the player has on (fungus-policy.md §5.1, lever 3; levers.ts) */
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
  /** the Lab (ja-nan3): how sharply ants draw their mode from Jev's probabilities (ColonyParams.sampleTemp), and how often they draw again (reroll, s) */
  sampleTemp: number;
  reroll: number;
  /** the Lab (ja-ykmu.3): whether ants out exploring or following ask their steering weights (ColonyParams.steerLane) */
  steerLane: boolean;
}

/** One world's two views (docs/one-world.md §5): "above" the plane, "below" the curtain under the line. */
export type View = "above" | "below";

/** The game's default speed (owner, PRD §50: faster by default, every rate scaled together; no sim constant changes). */
export const GAME_SPEED = 4;
/** The top speed the controls offer. */
export const MAX_SPEED = 8;
/** The game's fungus: one species, the player's, which spreads like Garden (PRD §50; the other strains are lab presets). */
export const GAME_STRAIN = STRAINS.findIndex((s) => s.id === "garden");
export { landingColony, landingOf } from "./landing.ts";

export const DEFAULT_COLONY_CONTROLS: ColonyControls = {
  species: GENERIC_ANT.id,
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
  sampleTemp: DEFAULT_COLONY.sampleTemp,
  reroll: DEFAULT_COLONY.reroll,
  // Off by default: main's steering, bit for bit. The Lab's switch turns the policy-set weights on (docs/steering.md).
  steerLane: false,
};

/** A game as the page builds it from its settings: a fresh world, nothing played (a save is poured in with Game.load). */
export function buildGame(s: GameSettings): Game {
  // The page plays one world only (owner, 2026-11-10; PRD §55): the side and open maps stay for the assays and scripts.
  // Its fungus grows as hyphae (ja-2bw, PRD §63): they fruit where they reach a tunnel, and its dead hosts are new starts.
  const map = generateOneWorld(s.seed);
  return new Game(
    map,
    {
      antCount: s.antCount,
      rivalAnts: s.antCount,
      rival: s.rival,
      regrow: GAME_REGROW,
      autoFound: false,
      fungus: { hyphae: true },
      species: speciesById(s.species),
    },
    gameRng(s.seed, s.generation),
  );
}

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
    const build = () =>
      buildGame({ species: controls.species, seed: controls.seed, antCount: controls.antCount, rival: controls.rival, generation });
    const g = build();
    const r = pending.current;
    if (
      r &&
      r.settings.species === controls.species &&
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
  }, [controls.species, controls.seed, controls.antCount, controls.rival, generation, loads]);
  // The player's policy settings outlive a game: apply them to every new one's fungus.
  useEffect(() => {
    game.fungus.configure({ hide: controls.hide, cull: controls.cull }, controls.menu);
  }, [game, controls.hide, controls.cull, controls.menu]);
  // So do the Lab's settings for how ants draw their mode (ja-nan3), on every colony, founded later or not.
  useEffect(() => {
    game.setChoice({ sampleTemp: controls.sampleTemp, reroll: controls.reroll, steerLane: controls.steerLane ? 1 : 0 });
  }, [game, controls.sampleTemp, controls.reroll, controls.steerLane]);
  // The frame loop (gameLoop.ts) goes on across pauses and speed changes: playing and speed are set on it, not a reason to rebuild it.
  const frameListeners = useRef(new Set<() => void>());
  const lastLoop = useRef<GameLoop | null>(null);
  const loop = useMemo(
    () =>
      new GameLoop(game, journal, {
        carry: lastLoop.current ?? undefined,
        playing: controls.playing,
        speed: controls.speed,
        // A new queen has flown (ja-lo8.9): the game waits for the page to found her.
        onFlight: () => setControls((c) => ({ ...c, playing: false })),
        frame: frameListeners.current,
      }),
    // A new game is a new loop; `controls` reaches an existing one through loop.set, below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, journal],
  );
  useEffect(() => {
    loop.start();
    lastLoop.current = loop;
    return () => loop.stop();
  }, [loop]);
  useEffect(() => loop.set(controls.playing, controls.speed), [loop, controls.playing, controls.speed]);

  // The dev hook (window.jevAnts, the game and the page's views) is dev/hook.ts, installed by ColonyApp.
  // Once the player has pressed Start, every game begins with the fungus landing by the hole of the colony its seed chose.
  useEffect(() => {
    if (controls.started && !game.landed) game.land(landingOf(game), GAME_STRAIN, { evolve: true });
  }, [game, controls.started]);
  /** A saved game, as it was: its world and settings, then its state (Game.load), playing. The player's state is the page's to put back. */
  const loadSave = useCallback((r: SaveRecord) => {
    pending.current = r;
    setGeneration(r.settings.generation);
    setControls((c) => ({
      ...c,
      species: r.settings.species,
      seed: r.settings.seed,
      antCount: r.settings.antCount,
      rival: r.settings.rival,
      started: true,
      playing: true,
    }));
    setLoads((n) => n + 1);
  }, []);
  /**
   * Step the game `n` fixed ticks of MAX_STEP (1/30 s: the assays' tick, and the longest the loop takes): Lab mode's step control, used while paused
   * (PRD §69.7). A flight stops it, as it stops play: the page founds her before the game goes on.
   */
  const step = useCallback(
    (n: number) => {
      for (let k = 0; k < n && !game.flights.length; k++) {
        game.tick(MAX_STEP);
        journal?.observe(game);
      }
    },
    [game, journal],
  );
  /** What builds this game again (saves.ts). */
  const settings: GameSettings = {
    species: controls.species,
    seed: controls.seed,
    antCount: controls.antCount,
    rival: controls.rival,
    generation,
  };

  /** The start screen's Start: this seed, the fungus lands; playing at the game's speed, or paused at 1× for the tutorial (PRD §61). */
  const start = useCallback(
    (seed: number, tutorial = false, species: string = GENERIC_ANT.id) =>
      setControls((c) => ({
        ...c,
        species,
        // The menu follows the species: rouse on where finders invite, off where they don't (owner, review of #202 D2).
        menu: menuFor(c.menu, (SPECIES[species]?.params.invitePace ?? 0) > 0),
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

  return { game, loop, controls, update, onFrame, restart, newWorld, start, loadSave, settings, evolve, journal, step };
}
