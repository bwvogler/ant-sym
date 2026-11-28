import { type Colony, odourDistance, STRANGER_EPS } from "../colony/index.ts";

// The odour lens (ja-zg1u.8, docs/odour-space.md "Play"): what the contact sense of one ant, or of a colony's nest, reads: the odour's K numbers, and its
// distance to another against the tolerance. Pure, so `node --test` covers it; AntCard and the Lab's odour card draw it. It says only what the field's
// colours stand for: an ant's own odour against its own nest's (nestmate or not, the sense of the ant's neighbours), and a colony's nest against the
// other nests the fungus has met.

/** One axis of an odour, with the nest's value beside it. */
export interface OdourAxisRow {
  axis: number;
  value: number;
  /** the reference odour's value on this axis (the ant's nest; null when there is none) */
  nest: number | null;
}

/** An odour, and how far it is from a reference against a tolerance. */
export interface OdourReadout {
  axes: OdourAxisRow[];
  /** the distance to the reference (null with none) */
  distance: number | null;
  tolerance: number;
  /** whether it is further than the tolerance (a stranger to the reference) */
  stranger: boolean;
}

/** Whether odours `d` apart are strangers at tolerance `tol` (recognition.ts: further than tolerance + STRANGER_EPS). */
export const isStranger = (d: number, tol: number): boolean => d > tol + STRANGER_EPS;

/** Ant i's odour against its own nest's, at its own tolerance (what its neighbours' recognition reads of it). */
export function antOdour(col: Colony, i: number): OdourReadout {
  const K = col.odourAxes;
  const tolerance = col.tolerance[i] as number;
  const axes: OdourAxisRow[] = [];
  for (let k = 0; k < K; k++) axes.push({ axis: k, value: col.odourAt(i, k), nest: col.nestVec[k] as number });
  const distance = odourDistance(K, col.odour, i * K, col.nestVec, 0);
  return { axes, distance, tolerance, stranger: isStranger(distance, tolerance) };
}

/** One colony's nest odour, and how far it is from every other colony in the list. */
export interface ColonyOdour {
  k: number;
  axes: OdourAxisRow[];
  tolerance: number;
  /** its distance to each other colony of the list: the nests' gap, and whether that makes them strangers */
  gaps: { k: number; distance: number; stranger: boolean }[];
}

/** The nest odours of colonies `ks` (indices into `colonies`), each against the others of the list at the game's tolerance. */
export function colonyOdours(colonies: readonly Colony[], ks: readonly number[], tolerance: number): ColonyOdour[] {
  return ks.flatMap((k) => {
    const c = colonies[k];
    if (!c) return [];
    const K = c.odourAxes;
    return [
      {
        k,
        axes: Array.from({ length: K }, (_, a) => ({ axis: a, value: c.nestVec[a] as number, nest: null })),
        tolerance,
        gaps: ks.flatMap((o) => {
          const other = colonies[o];
          if (o === k || !other) return [];
          const distance = odourDistance(K, c.nestVec, 0, other.nestVec, 0);
          return [{ k: o, distance, stranger: isStranger(distance, tolerance) }];
        }),
      },
    ];
  });
}

/** The line under the bars: the distance, the tolerance, and what that makes them. */
export function distanceText(r: OdourReadout, who: string): string {
  if (r.distance === null) return "";
  return `${r.distance.toFixed(2)} from ${who}, ${r.stranger ? "past" : "within"} the tolerance ${r.tolerance.toFixed(2)}: ${r.stranger ? "a stranger" : "a nestmate"}`;
}
