import { type Colony, CURTAIN, INFECTED, PLANE } from "../colony/index.ts";
import { ALARM_FULL, ALARM_SHOWN } from "./lens.ts";

// The Codex (PRD §69.4, ja-mvo9.3): the field guide's entries open as the player first sees what each is about, through
// the hosts the fungus lives in. Pure: `cues` reads the game, `UNLOCK` says which cue opens which entry, and the seen
// set is kept per browser through `loadSeen` / `saveSeen`, which take the storage (it can be missing or throw).

/** Something the player has now seen, through a host or on the map. */
export type Cue =
  "start" | "host" | "hostCarrying" | "hostOut" | "hostBelow" | "hostFighting" | "hostTired" | "alarm" | "death" | "unity" | "mutation";

/** Each guide entry's cue, and what to look for, said on its locked card. codex.test holds every guide entry here. */
export const UNLOCK: Record<string, { cue: Cue; hint: string }> = {
  fungus: { cue: "start", hint: "open from the start" },
  "fungus-senses": { cue: "start", hint: "open from the start" },
  "one-world": { cue: "start", hint: "open from the start" },
  "desert-ant": { cue: "start", hint: "open from the start" },
  jobs: { cue: "host", hint: "your first host" },
  "food-trail": { cue: "hostCarrying", hint: "a host carrying food home" },
  "food-quality": { cue: "hostCarrying", hint: "a host carrying food home" },
  "forager-trips": { cue: "hostCarrying", hint: "a host carrying food home" },
  "way-home": { cue: "hostCarrying", hint: "a host carrying food home" },
  "route-memory": { cue: "hostCarrying", hint: "a host carrying food home" },
  "home-trail": { cue: "hostOut", hint: "a host out on the surface" },
  "double-bridge": { cue: "hostOut", hint: "a host out on the surface" },
  "no-entry": { cue: "hostOut", hint: "a host out on the surface" },
  chambers: { cue: "hostBelow", hint: "a host underground" },
  inside: { cue: "hostBelow", hint: "a host underground" },
  queen: { cue: "hostBelow", hint: "a host underground" },
  brood: { cue: "hostBelow", hint: "a host underground" },
  alarm: { cue: "alarm", hint: "alarm where a host is" },
  strangers: { cue: "hostFighting", hint: "a host meeting strangers" },
  fatigue: { cue: "hostTired", hint: "a host tired out" },
  midden: { cue: "death", hint: "the first ant to die" },
  evolution: { cue: "mutation", hint: "your first mutation to keep" },
  unity: { cue: "unity", hint: "the colonies' odours drawing together" },
};

/** The two nests' odours this far apart, or nearer (1 at the start: Unity.gap), counts as drawing together. */
export const UNITY_SEEN = 0.9;

/** What the game shows now that the Codex counts, from the game's colonies and a few of its numbers. */
export function cues(colonies: readonly Colony[], g: { deaths: number; unityGap: number; mutations: number }): Set<Cue> {
  const out = new Set<Cue>(["start"]);
  if (g.deaths > 0) out.add("death");
  if (g.unityGap <= UNITY_SEEN) out.add("unity");
  if (g.mutations > 0) out.add("mutation");
  for (const c of colonies) {
    for (let i = 0; i < c.n; i++) {
      if (!c.alive[i] || c.load[i]! < INFECTED) continue;
      out.add("host");
      const l = c.layer[i] ?? PLANE;
      if (c.carrying[i] === 1) out.add("hostCarrying");
      if (l === CURTAIN) out.add("hostBelow");
      else out.add("hostOut");
      // Strangers met, whatever the ant's mode (its own contact, battle.ts: a raid or defence mode is the policy's, and the
      // desert ant's rule never fights): review of #206, S1.
      if (c.foes[i]! > 0) out.add("hostFighting");
      if (c.tired[i]) out.add("hostTired");
      // Alarm the field would show at the host's cell: a host senses its own cell, so it shows at full sight there.
      if (!out.has("alarm"))
        for (const o of colonies) {
          const a = o.layers[l]?.ph.fields.alarm.get(c.cellX[i]!, c.cellY[i]!) ?? 0;
          if (Math.min(1, a / ALARM_FULL) > ALARM_SHOWN) {
            out.add("alarm");
            break;
          }
        }
    }
  }
  return out;
}

/** The entries of `ids` that `seen` cues open and the player has not seen yet, in their order. An entry with no row opens at the start. */
export function newlyOpen(ids: readonly string[], seen: ReadonlySet<string>, now: ReadonlySet<Cue>): string[] {
  return ids.filter((id) => !seen.has(id) && now.has(UNLOCK[id]?.cue ?? "start"));
}

/** Titles for one notice: "a", "a and b", "a, b and c". */
export const listed = (xs: readonly string[]): string =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

type Storage = Pick<globalThis.Storage, "getItem" | "setItem" | "removeItem">;
export const SEEN_KEY = "jev-ants:codex-seen";
export const ALL_KEY = "jev-ants:codex-all";

/** The entries this browser has seen (an empty set where storage is missing, blocked or holds something else). */
export function loadSeen(storage: () => Storage | null): Set<string> {
  try {
    const v = JSON.parse(storage()?.getItem(SEEN_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function saveSeen(storage: () => Storage | null, seen: ReadonlySet<string>): void {
  try {
    storage()?.setItem(SEEN_KEY, JSON.stringify([...seen]));
  } catch {
    // Blocked storage: the Codex forgets at the end of the page, nothing worse.
  }
}

/** Whether the guide shows every entry, seen or not (the player's switch). */
export function loadAll(storage: () => Storage | null): boolean {
  try {
    return storage()?.getItem(ALL_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAll(storage: () => Storage | null, all: boolean): void {
  try {
    if (all) storage()?.setItem(ALL_KEY, "1");
    else storage()?.removeItem(ALL_KEY);
  } catch {
    // as saveSeen
  }
}
