import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Colony, type Mode } from "../colony/colony.ts";
import { generateWorld, mulberry32 } from "../colony/world.ts";

// Owns the one Colony and its animation loop, like useEngine for the
// picture: React state carries only what the panel shows, the renderer reads
// the colony's typed arrays every frame. A new seed or ant count is a new
// colony on a fresh map (food that was carried home stays carried home).

export interface ColonyControls {
  seed: number;
  antCount: number;
  speed: number;
  playing: boolean;
  showFoodTrail: boolean;
  showHomeTrail: boolean;
}

export const DEFAULT_COLONY_CONTROLS: ColonyControls = { seed: 1, antCount: 800, speed: 1, playing: true, showFoodTrail: true, showHomeTrail: false };

export interface ColonyStats {
  time: number;
  stored: number;
  foodTotal: number;
  foodLeft: number;
  counts: Record<Mode, number>;
  /** policy mode choices per second, over the last second */
  choicesPerSecond: number;
  situationsSeen: number;
}

/** Longest single sim step: sensing a trail 3 cells ahead needs steps well under a cell. */
const MAX_STEP = 1 / 30;

export function useColony(initial: ColonyControls = DEFAULT_COLONY_CONTROLS) {
  const [controls, setControls] = useState<ColonyControls>(initial);
  // Bumped by Restart: the same seed again, from scratch.
  const [generation, setGeneration] = useState(0);
  const colony = useMemo(
    () => new Colony(generateWorld(controls.seed), { antCount: controls.antCount }, mulberry32(controls.seed * 7919 + generation)),
    [controls.seed, controls.antCount, generation],
  );
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
        for (let k = 0; k < steps; k++) colony.tick(total / steps);
      }
      if (colony.time - rateAt.t >= 1) {
        rate = (colony.decisions - rateAt.decisions) / (colony.time - rateAt.t);
        rateAt = { t: colony.time, decisions: colony.decisions };
      }
      if (t - lastStats > 150) {
        setStats({ time: colony.time, stored: colony.stored, foodTotal: colony.map.foodTotal, foodLeft: colony.foodLeft, counts: colony.counts(), choicesPerSecond: rate, situationsSeen: colony.situationsSeen });
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
  }, [colony, controls.playing, controls.speed]);

  const onFrame = useCallback((fn: () => void) => {
    frameListeners.current.add(fn);
    return () => void frameListeners.current.delete(fn);
  }, []);
  const update = useCallback((patch: Partial<ColonyControls>) => setControls((c) => ({ ...c, ...patch })), []);
  const restart = useCallback(() => setGeneration((g) => g + 1), []);
  const newWorld = useCallback(() => setControls((c) => ({ ...c, seed: 1 + Math.floor(Math.random() * 99_999) })), []);

  return { colony, controls, update, stats, fps, onFrame, restart, newWorld };
}
