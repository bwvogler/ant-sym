import type { Colony } from "./colony.ts";
import { CELL } from "./hex.ts";
import { binCentre, binOf, odourDistance, STRANGER_EPS } from "./recognition.ts";
import { blocked } from "./world.ts";

export type AttackCue = (colony: Colony, ant: number) => boolean;

/** Snapshot before any colony moves, so each worker observes attacks declared on the previous tick. */
export function snapshotAttackCue(colonies: readonly Colony[]): AttackCue {
  const attackers: { x: number; y: number; layer: number; at: number; owner: Colony; ant: number }[] = [];
  // Each attacker's band centre, K numbers apiece, at `at`: taken now, as the odours are before anyone moves.
  const centres: number[] = [];
  for (const colony of colonies) {
    const K = colony.odourAxes;
    for (let i = 0; i < colony.n; i++) {
      if (colony.alive[i] && colony.attackLayer[i] === colony.layer[i]) {
        attackers.push({ x: colony.x[i], y: colony.y[i], layer: colony.layer[i], at: centres.length, owner: colony, ant: i });
        for (let k = 0; k < K; k++) centres.push(binCentre(binOf(colony.odour[i * K + k])));
      }
    }
  }

  return (colony, ant) => {
    const x = colony.x[ant],
      y = colony.y[ant];
    const [cellX, cellY] = CELL;
    try {
      return attackers.some((other) => {
        if (
          (other.owner === colony && other.ant === ant) ||
          other.layer !== colony.layer[ant] ||
          odourDistance(colony.odourAxes, centres, other.at, colony.odour, ant * colony.odourAxes) <= colony.tolerance[ant] + STRANGER_EPS
        )
          return false;
        const dx = other.x - x,
          dy = other.y - y;
        if (dx * dx + dy * dy > 1) return false;
        for (let step = 0; step <= 4; step++) {
          if (blocked(colony.map, x + (dx * step) / 4, y + (dy * step) / 4)) return false;
        }
        return true;
      });
    } finally {
      CELL[0] = cellX;
      CELL[1] = cellY;
    }
  };
}
