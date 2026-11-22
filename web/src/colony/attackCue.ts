import type { Colony } from "./colony.ts";
import { CELL } from "./hex.ts";
import { binCentre, binOf, STRANGER_EPS } from "./recognition.ts";
import { blocked } from "./world.ts";

export type AttackCue = (colony: Colony, ant: number) => boolean;

/** Snapshot before any colony moves, so each worker observes attacks declared on the previous tick. */
export function snapshotAttackCue(colonies: readonly Colony[]): AttackCue {
  const attackers: { x: number; y: number; layer: number; odour: number; owner: Colony; ant: number }[] = [];
  for (const colony of colonies) {
    for (let i = 0; i < colony.n; i++) {
      if (colony.alive[i] && colony.attackLayer[i] === colony.layer[i]) {
        attackers.push({
          x: colony.x[i],
          y: colony.y[i],
          layer: colony.layer[i],
          odour: binCentre(binOf(colony.odour[i])),
          owner: colony,
          ant: i,
        });
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
          Math.abs(other.odour - colony.odour[ant]) <= colony.tolerance[ant] + STRANGER_EPS
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
