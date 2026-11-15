import { type Colony, CURTAIN, INFECTED, MODES } from "../colony/index.ts";
import { followedColony, type Followed } from "./follow.ts";
import { colonyName } from "./names.ts";

// Specimens (PRD §69.5, ja-mvo9.3): up to three ants the player pins, to watch and compare side by side. Pure: the list's
// rules and each row's words are here, tested; the inspector shows them, the map marks them. An ant is (colony, slot,
// generation), as a follow is: a specimen that dies leaves the list (its slot's next ant is another ant).

/** At most this many specimens: a fourth replaces the oldest. */
export const MAX_SPECIMENS = 3;

export const sameAnt = (a: Followed, b: Followed): boolean => a.k === b.k && a.i === b.i && a.gen === b.gen;

/** The list with `f` pinned: last, and the oldest dropped (and said) when the list was full. Already pinned: unchanged. */
export function pin(list: readonly Followed[], f: Followed): { list: Followed[]; dropped: Followed | null } {
  if (list.some((s) => sameAnt(s, f))) return { list: [...list], dropped: null };
  const full = list.length >= MAX_SPECIMENS;
  return { list: [...(full ? list.slice(1) : list), f], dropped: full ? list[0]! : null };
}

export const unpin = (list: readonly Followed[], f: Followed): Followed[] => list.filter((s) => !sameAnt(s, f));

/** The specimens still alive, and those gone (dead, or their slot taken by a newborn). */
export function living(list: readonly Followed[], colonies: readonly Colony[]): { kept: Followed[]; gone: Followed[] } {
  const kept: Followed[] = [];
  const gone: Followed[] = [];
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

export const specimenLabel = (n: number): string => `No. ${n + 1}`;

/** Specimen n's row, or null when the ant is gone. */
export function specimenRow(colonies: readonly Colony[], f: Followed, n: number): SpecimenRow | null {
  const c = followedColony(colonies, f);
  if (!c) return null;
  const load = c.load[f.i]!;
  return {
    label: specimenLabel(n),
    who: `#${f.i} · ${colonyName(f.k)}`,
    mode: MODES[c.mode[f.i]!] ?? "?",
    carrying: c.carrying[f.i] === 1,
    load: Math.min(1, load),
    host: load >= INFECTED,
    below: c.layer[f.i] === CURTAIN,
    fatigue: c.fatigue[f.i]!,
    patience: c.params.patience,
  };
}
