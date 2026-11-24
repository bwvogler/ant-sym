import { INFECTED, PLANE, type Colony, type Game } from "../../colony/index.ts";
import type { Knowledge } from "./knowledge.ts";

// The colonies the fungus knows of (docs/fog-of-war.md §4.4, PRD §89, ja-1ypq.2; owner, 2026-11-23). A colony is known once its
// hole has been sensed or it holds a host. Its readout is live while it holds a host, and otherwise stays as of the step its last
// host left. A colony known by its hole alone has no readout yet: the fungus learned the nest is there, not its counts.
// A picture only: nothing in the simulation reads it.

export interface KnownColony<T> {
  /** the readout as of `asOf`; null for a colony known by its hole alone, before any host */
  readout: T | null;
  /** the sim time of the readout; for one known by its hole alone, when it was first sensed */
  asOf: number;
  /** whether the colony holds a host now, so the readout is the present */
  live: boolean;
}

/** How many ants of `c` are hosts now. */
export function hostsOf(c: Colony): number {
  let n = 0;
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= INFECTED) n++;
  return n;
}

export class KnownColonies<T> {
  readonly #read: (c: Colony, game: Game) => T;
  readonly #known = new Map<number, KnownColony<T>>();
  /** sim seconds between two readings of a colony that holds a host: the numbers are never staler than this */
  static readonly EVERY = 0.5;

  /** `read` takes the numbers a readout shows from a colony: it is called only while the colony holds a host. */
  constructor(read: (c: Colony, game: Game) => T) {
    this.#read = read;
  }

  /** Call once after each sim step, after the fog's sight is stamped. Time gone back (a restart, a load) forgets everything. */
  update(game: Game, knowledge: Knowledge): void {
    for (const k of this.#known.values())
      if (k.asOf > game.time) {
        this.#known.clear(); // time went back (a restart, a load)
        break;
      }
    game.colonies.forEach((c, i) => {
      const k = this.#known.get(i);
      if (hostsOf(c) > 0) {
        // A colony read a moment ago is not read again each step (a reading walks every ant).
        if (k?.live && k.readout !== null && game.time - k.asOf < KnownColonies.EVERY) return;
        this.#known.set(i, { readout: this.#read(c, game), asOf: game.time, live: true });
      } else if (k) {
        if (k.live) k.live = false; // the last host left: the readout stays as it was
      } else {
        // The colony's own hole (holeCells lists every nest's on the map: its own is at params.nest), a plane cell.
        const hole = c.holeCells[c.params.nest];
        if (hole && knowledge.explored(PLANE, hole.px, hole.py)) this.#known.set(i, { readout: null, asOf: game.time, live: false });
      }
    });
  }

  /** Forget everything. */
  clear(): void {
    this.#known.clear();
  }

  /** What the fungus knows of colony `i`; null while it does not know it. */
  get(i: number): KnownColony<T> | null {
    return this.#known.get(i) ?? null;
  }

  /** The indexes of the known colonies, in order. */
  list(): number[] {
    return [...this.#known.keys()].sort((a, b) => a - b);
  }
}
