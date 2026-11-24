import { type Colony, INFECTED, isCurtainLayer, MODES } from "../colony/index.ts";
import { followedColony, type Followed } from "./follow.ts";
import { colonyName } from "./names.ts";

// Specimens (PRD §69.5, ja-mvo9.3): up to three ants the player pins, to watch and compare side by side. Pure: the list's
// rules and each row's words are here, tested; the inspector shows them, the map marks them. An ant is (colony, slot,
// generation), as a follow is: a specimen that dies leaves the list (its slot's next ant is another ant).

/** At most this many specimens: a fourth replaces the oldest. */
export const MAX_SPECIMENS = 3;

/** A pinned ant and the number it keeps (owner, review of #218, D1): the lowest free one when pinned; nothing renumbers it. */
export interface Specimen extends Followed {
  no: number;
}

export const sameAnt = (a: Followed, b: Followed): boolean => a.k === b.k && a.i === b.i && a.gen === b.gen;

/** The lowest number from 1 that no specimen of `list` holds. */
export function freeNumber(list: readonly Specimen[]): number {
  let n = 1;
  while (list.some((s) => s.no === n)) n++;
  return n;
}

/**
 * The list with `f` pinned: last, with the lowest free number, and the oldest dropped (and said) when the list was full,
 * which frees its number. Already pinned: unchanged.
 */
export function pin(list: readonly Specimen[], f: Followed): { list: Specimen[]; dropped: Specimen | null } {
  if (list.some((s) => sameAnt(s, f))) return { list: [...list], dropped: null };
  const full = list.length >= MAX_SPECIMENS;
  const kept = full ? list.slice(1) : [...list];
  return { list: [...kept, { k: f.k, i: f.i, gen: f.gen, no: freeNumber(kept) }], dropped: full ? list[0]! : null };
}

export const unpin = (list: readonly Specimen[], f: Followed): Specimen[] => list.filter((s) => !sameAnt(s, f));

/** The specimens still alive, and those gone (dead, or their slot taken by a newborn). */
export function living(list: readonly Specimen[], colonies: readonly Colony[]): { kept: Specimen[]; gone: Specimen[] } {
  const kept: Specimen[] = [];
  const gone: Specimen[] = [];
  for (const s of list) (followedColony(colonies, s) ? kept : gone).push(s);
  return { kept, gone };
}

/** A specimen's line in the inspector: its label and the few things worth comparing. */
export interface SpecimenRow {
  /** "No. 1" */
  label: string;
  /** "#12 · Ink" */
  who: string;
  mode: string;
  carrying: boolean;
  /** the fungus in it, 0 to 1, and whether that makes it a host */
  load: number;
  host: boolean;
  below: boolean;
  /** seconds of unsuccessful search, of its colony's patience */
  fatigue: number;
  patience: number;
}

export const specimenLabel = (no: number): string => `No. ${no}`;

/** Specimen s's row, or null when the ant is gone. */
export function specimenRow(colonies: readonly Colony[], s: Specimen): SpecimenRow | null {
  const c = followedColony(colonies, s);
  if (!c) return null;
  const load = c.load[s.i]!;
  return {
    label: specimenLabel(s.no),
    who: `#${s.i} · ${colonyName(s.k)}`,
    mode: MODES[c.mode[s.i]!] ?? "?",
    carrying: c.carrying[s.i] === 1,
    load: Math.min(1, load),
    host: load >= INFECTED,
    below: isCurtainLayer(c.layer[s.i]!),
    fatigue: c.fatigue[s.i]!,
    patience: c.params.patience,
  };
}
