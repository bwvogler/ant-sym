import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Colony, Mode, Stance } from "../colony/colony.ts";
import { Game, type Outcome } from "../colony/game.ts";
import { generateWorld, mulberry32, OPEN_WORLD } from "../colony/world.ts";

// Owns the one Game (the player's colony and the rival) and its animation
// loop, like useEngine for the picture: React state carries only what the
// panel shows, the renderer reads the colonies' typed arrays every frame. A
// new seed, ant count or rival setting is a new game on a fresh map.

/** The fungus's brushes: lure paints food scent (ants follow it), alarm paints alarm (ants shy away, a doctrine can send them home). */
export type Brush = "none" | "lure" | "alarm";

export interface ColonyControls {
  seed: number;
  antCount: number;
  speed: number;
  playing: boolean;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
  brush: Brush;
  /** a rival colony at the map's second nest */
  rival: boolean;
  /** underground (mostly soil: the ants dig their tunnels) or the open surface */
  ground: Ground;
}

export type Ground = "underground" | "open";

export const DEFAULT_COLONY_CONTROLS: ColonyControls = { seed: 1, antCount: 600, speed: 1, playing: true, showFoodTrail: true, showHomeTrail: false, brush: "none", rival: true, ground: "underground" };

/** Per paint event (a pointer move while dragging): radius in cells and the amount laid per cell. */
const BRUSHES = { lure: { channel: "food", radius: 2, amount: 3 }, alarm: { channel: "alarm", radius: 3, amount: 12 } } as const;

/** One colony's line in the panel. */
export interface SideStats {
  population: number;
  cap: number;
  stored: number;
  losses: number;
  births: number;
  stance: Stance;
  /** soil cells dug */
  dug: number;
  /** pellets of it on the mound */
  mound: number;
  /** pellets of it put back into unused dead ends */
  filled: number;
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
  you: SideStats;
  rival: SideStats | null;
  outcome: Outcome;
}

function side(c: Colony): SideStats {
  return { population: c.population, cap: c.params.maxAnts, stored: c.stored, losses: c.losses, births: c.births, stance: c.stance, dug: c.soilDug, mound: c.soilOut, filled: c.soilFilled };
}

/** Longest single sim step: sensing a trail 3 cells ahead needs steps well under a cell. */
const MAX_STEP = 1 / 30;

export function useColony(initial: ColonyControls = DEFAULT_COLONY_CONTROLS) {
  const [controls, setControls] = useState<ColonyControls>(initial);
  // Bumped by Restart: the same seed again, from scratch.
  const [generation, setGeneration] = useState(0);
  const game = useMemo(
    () => new Game(generateWorld(controls.seed, controls.ground === "open" ? OPEN_WORLD : {}), { antCount: controls.antCount, rivalAnts: controls.antCount, rival: controls.rival }, mulberry32(controls.seed * 7919 + generation)),
    [controls.seed, controls.antCount, controls.rival, controls.ground, generation],
  );
  const colony = game.player;
  const [stats, setStats] = useState<ColonyStats | null>(null);
  const [fps, setFps] = useState(0);
  const frameListeners = useRef(new Set<() => void>());

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let lastStats = 0;
    let frames = 0;
    let fpsAt = last;
    let rateAt = { t: colony.time, decisions: colony.decisions };
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
        rate = (colony.decisions - rateAt.decisions) / (colony.time - rateAt.t);
        rateAt = { t: colony.time, decisions: colony.decisions };
      }
      if (t - lastStats > 150) {
        setStats({
          time: colony.time,
          stored: colony.stored,
          foodTotal: colony.map.foodTotal,
          foodLeft: colony.foodLeft,
          counts: colony.counts(),
          choicesPerSecond: rate,
          situationsSeen: colony.situationsSeen,
          you: side(colony),
          rival: game.rival ? side(game.rival) : null,
          outcome: game.outcome(),
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
      if (controls.brush === "none") return;
      const b = BRUSHES[controls.brush];
      colony.paint(b.channel, x, y, b.radius * scale, b.amount);
    },
    [colony, controls.brush],
  );

  return { game, colony, controls, update, stats, fps, onFrame, restart, newWorld, paint };
}
