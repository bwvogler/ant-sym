// Brood, pure (nest slice 4, docs/nest-and-home.md §3.4): the colony's young, from egg to larva to pupa, each lying on
// a cell of the nest (or held by a nurse carrying it). The queen lays eggs; larvae must be fed before they pupate; a
// pupa becomes a worker where it lies. Births come from pupae, not from a counter.

export const EGG = 0;
export const LARVA = 1;
export const PUPA = 2;
export type Stage = typeof EGG | typeof LARVA | typeof PUPA;
/** Food a larva is fed before it pupates (an egg costs 1 more: a worker costs 4). */
export const LARVA_FOOD = 3;
/** Castes (ja-lo8.9, royal.ts): a worker, or a gyne (a new queen, fed and grown GYNE_FOOD_X / GYNE_TIME_X as much). */
export const WORKER = 0;
export const GYNE = 1;
/** Food a gyne larva is fed (royal.ts GYNE_FOOD_X × a worker's). */
export const GYNE_FOOD = 3 * LARVA_FOOD;

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
  /** its energy, 0..1 (larvae; ja-xu6.1, hunger.ts): it drains while the larva waits, food goes to it before growth, and at 0 the larva dies */
  energy: number;
  /** its caste (ja-lo8.9): WORKER, or GYNE once nurses rear it as a new queen */
  caste: number;
  /** seconds of the caste cue so far (royal.ts): toward a gyne while bipotent, toward a cull once a gyne */
  cue: number;
}

export class Brood {
  readonly items: BroodItem[] = [];

  add(x: number, y: number, chamber: number): BroodItem {
    const b: BroodItem = { x, y, stage: EGG, t: 0, fed: 0, held: -1, chamber, energy: 1, caste: WORKER, cue: 0 };
    this.items.push(b);
    return b;
  }

  /** Food the brood still has to be fed: what each egg and larva lacks of its food (a pupa is fed). */
  owed(): number {
    let s = 0;
    for (const b of this.items) s += owed(b);
    return s;
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

/** The food brood item b is fed as a larva: a worker's LARVA_FOOD, a gyne's GYNE_FOOD. */
export function foodOf(b: BroodItem): number {
  return b.caste === GYNE ? GYNE_FOOD : LARVA_FOOD;
}

/** Whether a larva has been fed all it needs (a pupa has; an egg hasn't). */
export function isFed(b: BroodItem): boolean {
  return b.fed >= foodOf(b) - 1e-9;
}

/** Food brood item b still has to be fed: none once it is a pupa. */
export function owed(b: BroodItem): number {
  return b.stage === PUPA ? 0 : foodOf(b) - b.fed;
}
