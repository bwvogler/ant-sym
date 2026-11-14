import { useEffect, useState } from "react";
import type { Colony, Fungus, WorldMap } from "../colony/index.ts";
import type { Followed } from "./follow.ts";
import type { SensedMap } from "./fungusSight.ts";
import LensCard from "./LensCard.tsx";
import { lensAnt, lensLines, probe } from "./lens.ts";
import { clearProbe, useProbe } from "./lensStore.ts";

// The lens's card over the page (PRD §69.3): it reads the store the map reports to, so only this re-renders as the pointer
// moves. A point of the view not shown waits (hidden, and not taking Escape) till that view is shown again.

export default function LensLayer({
  on,
  colonies,
  fungus,
  world,
  sensed,
  layer,
  trails,
  onFollow,
}: {
  on: boolean;
  colonies: readonly Colony[];
  fungus: Fungus;
  world: { plane: WorldMap; curtain: WorldMap } | null;
  sensed: SensedMap;
  /** the layer shown: PLANE or CURTAIN, or −1 on a game of one map */
  layer: number;
  trails: { food: boolean; home: boolean };
  onFollow: (f: Followed) => void;
}) {
  const p = useProbe();
  const at = on && p && p.lv === layer ? p : null;
  const pinned = at?.pinned ?? false;
  // A pinned card: Escape closes it first (before a follow or a drawer), unless a dialog is over it.
  useEffect(() => {
    if (!pinned) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      clearProbe();
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [pinned]);
  // The card says it afresh four times a second while it is up: the ants move under a still pointer.
  const shown = at !== null;
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!shown) return;
    const t = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, [shown]);
  if (!at) return null;
  const ant = at.ant && colonies[at.ant.k]?.gen[at.ant.i] === at.ant.gen ? at.ant : null;
  const lines = lensLines(
    probe({ colonies, fungus, world }, sensed, at.lv, at.x, at.y, trails),
    ant ? lensAnt(colonies, ant.k, ant.i) : null,
  );
  return (
    <LensCard
      lines={lines}
      x={at.sx}
      y={at.sy}
      pinned={at.pinned}
      onClose={clearProbe}
      onFollow={ant ? () => (onFollow(ant), clearProbe()) : undefined}
    />
  );
}
