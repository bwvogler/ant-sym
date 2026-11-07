import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Colony, Mode, Stance } from "../colony/colony.ts";
import { DEFAULT_MENU, STRAINS, type Fungus } from "../colony/fungus.ts";
import { Game, gameRng, type Outcome, type Unity } from "../colony/game.ts";
import { generateSideWorld, generateWorld, OPEN_WORLD } from "../colony/world.ts";

// Owns the one Game (the player's colony and the rival) and its animation
// loop: React state carries only what the
// panel shows, the renderer reads the colonies' typed arrays every frame. A
// new seed, ant count or rival setting is a new game on a fresh map.

/**
 * The spore brush, a lab tool (Details): spores on the ground and a dose of the chosen strain into the ants there. The
 * lure and alarm brushes are gone (ja-lo8.2): they painted only the first colony's fields, a leftover from when the
 * player was that colony, and the fungus works through its hosts, not the player's hand.
 */
export type Brush = "none" | "spores";

export interface ColonyControls {
  seed: number;
  antCount: number;
  speed: number;
  playing: boolean;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  brush: Brush;
  /** which of the fungus's strains the spore brush paints (an index into STRAINS) */
  strain: number;
  /** the fungus's menu: the levers the player has on (§5.1, lever 4; levers.ts) */
  menu: string[];
  /** the local rule's settings: hide groomed hosts; cull high-load fighters among strangers */
  hide: boolean;
  cull: boolean;
  /** a rival colony at the map's second nest */
  rival: boolean;
  /** the side view (a cross-section: sky, the ground line, the nest dug below) or the open surface from above */
  ground: Ground;
}

export type Ground = "side" | "open";

export const DEFAULT_COLONY_CONTROLS: ColonyControls = { seed: 1, antCount: 600, speed: 1, playing: true, showFoodTrail: true, showHomeTrail: false, brush: "none", strain: 0, menu: [...DEFAULT_MENU], hide: false, cull: false, rival: true, ground: "side" };

/** The spore brush, per paint event: radius in cells, spores laid per cell, and load dosed into each ant under it. */
const SPORES = { radius: 3, spores: 2, dose: 0.15 } as const;

export { STRAINS };

/** One colony's line in the panel. */
export interface SideStats {
  population: number;
  cap: number;
  stored: number;
  losses: number;
  births: number;
  /** nest slice 4 (the side view): the queen ("lost": orphaned), and brood as eggs / larvae / pupae; null on the top-down maps */
  queen: "alive" | "lost" | null;
  brood: [number, number, number];
  /** brood killed by the fungus's crown (nest slice 8) */
  broodKilled: number;
  stance: Stance;
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
  return { population: c.population, cap: c.params.maxAnts, stored: c.stored, losses: c.losses, births: c.births, queen: c.queen ? (c.queen.alive ? "alive" : "lost") : null, brood: c.brood.counts(), broodKilled: c.broodKilled, stance: c.stance, infected: f.living ? f.infected / f.living : 0, resist: f.meanResist, dug: c.soilDug, mound: c.soilOut, filled: c.soilFilled, refilled: c.looseFilled };
}

/** Longest single sim step: sensing a trail 3 cells ahead needs steps well under a cell. */
const MAX_STEP = 1 / 30;

export function useColony(initial: ColonyControls = DEFAULT_COLONY_CONTROLS) {
  const [controls, setControls] = useState<ColonyControls>(initial);
  // Bumped by Restart: the same seed again, from scratch.
  const [generation, setGeneration] = useState(0);
  const game = useMemo(
    () => new Game(controls.ground === "open" ? generateWorld(controls.seed, OPEN_WORLD) : generateSideWorld(controls.seed), { antCount: controls.antCount, rivalAnts: controls.antCount, rival: controls.rival }, gameRng(controls.seed, generation)),
    [controls.seed, controls.antCount, controls.rival, controls.ground, generation],
  );
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
    const loop = (t: number) => {
      // Clamped both ways: a first frame stamped before `last` would step the sim backwards (negative trail).
      const dt = Math.max(0, Math.min(0.05, (t - last) / 1000));
      last = t;
      if (controls.playing) {
        const total = dt * controls.speed;
        const steps = Math.max(1, Math.ceil(total / MAX_STEP));
        for (let k = 0; k < steps; k++) game.tick(total / steps);
      }
      if (colony.time - rateAt.t >= 1) {
        rate = (decisions() - rateAt.decisions) / (colony.time - rateAt.t);
        rateAt = { t: colony.time, decisions: decisions() };
      }
      if (t - lastStats > 150) {
        setStats({
          time: colony.time,
          stored: game.colonies.reduce((n, c) => n + c.stored, 0),
          foodTotal: colony.map.foodTotal,
          foodLeft: colony.foodLeft,
          counts: sumCounts(game.colonies),
          choicesPerSecond: rate,
          situationsSeen: seenTogether(game.colonies),
          sides: game.colonies.map((c) => side(c, game.fungus)),
          fallen: game.fallen(),
          outcome: game.outcome(),
          sporeCells: game.fungus.sporeCells,
          unity: game.unity(),
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
  }, [game, colony, controls.playing, controls.speed]);

  const onFrame = useCallback((fn: () => void) => {
    frameListeners.current.add(fn);
    return () => void frameListeners.current.delete(fn);
  }, []);
  const update = useCallback((patch: Partial<ColonyControls>) => setControls((c) => ({ ...c, ...patch })), []);
  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const newWorld = useCallback(() => setControls((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99_999) })), []);
  /** Paint at (x, y) in cells; `scale` widens the brush (the field passes more when zoomed out, so a stroke stays a stroke on screen). */
  const paint = useCallback(
    (x: number, y: number, scale = 1) => {
      if (controls.brush !== "spores") return;
      game.paintSpores(x, y, SPORES.radius * scale, SPORES.spores, SPORES.dose, controls.strain);
    },
    [game, controls.brush, controls.strain],
  );

  return { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, paint };
}
