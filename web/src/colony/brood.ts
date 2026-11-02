// Brood, pure (nest slice 4, docs/nest-and-home.md §3.4): the colony's young, from egg to larva to pupa, each lying on
// a cell of the nest (or held by a nurse carrying it). The queen lays eggs; larvae must be fed before they pupate; a
// pupa becomes a worker where it lies. Births come from pupae, not from a counter.

export const EGG = 0;
export const LARVA = 1;
export const PUPA = 2;
export type Stage = typeof EGG | typeof LARVA | typeof PUPA;
export const STAGE_NAMES = ["egg", "larva", "pupa"] as const;

export interface BroodItem {
  /** the cell it lies on (or its nurse's, while held) */
  x: number;
  y: number;
  stage: Stage;
  /** seconds in this stage */
  t: number;
  /** food it has been fed (larvae) */
  fed: number;
  /** the ant carrying it, or −1 */
  held: number;
  /** the chamber it lies in (counted in that chamber's brood), or −1 */
  chamber: number;
}

export class Brood {
  readonly items: BroodItem[] = [];

  add(x: number, y: number, chamber: number): BroodItem {
    const b: BroodItem = { x, y, stage: EGG, t: 0, fed: 0, held: -1, chamber };
    this.items.push(b);
    return b;
  }

  remove(b: BroodItem): void {
    const k = this.items.indexOf(b);
    if (k >= 0) this.items.splice(k, 1);
  }

  /** Eggs, larvae and pupae. */
  counts(): [number, number, number] {
    const c: [number, number, number] = [0, 0, 0];
    for (const b of this.items) c[b.stage]++;
    return c;
  }

  get size(): number {
    return this.items.length;
  }
}
