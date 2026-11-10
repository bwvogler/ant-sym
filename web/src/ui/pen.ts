import { INFECTED } from "../colony/fungus.ts";
import { FLIGHT_2D, type Game } from "../colony/game.ts";
import { centreX, centreY } from "../colony/hex.ts";
import { mainGround, type OneWorld } from "../colony/oneWorld.ts";
import type { Flight } from "../colony/royal.ts";
import type { Cell, End, Transect } from "../colony/transect.ts";

// The queen's pen (ja-lo8.9), pure: whether a new queen who has flown opens it. The only time a colony's words change
// (PRD §50): a new queen born with the fungus in her, from a colony whose queen the fungus reached, while Jev can read
// new words. Otherwise she founds her colony on her mother's doctrine, and the page says why.

export type PenGate = { open: true } | { open: false; reason: string };

/**
 * Whether flight f opens the pen: the fungus is in her (load at INFECTED or more), her mother colony's queen was
 * reached (Game.revealed), and Jev can answer new words (`lock` null: policyLock). `mother` is her colony's name.
 */
export function penGate(f: Flight, revealed: readonly boolean[], lock: string | null, mother: string): PenGate {
  if (f.load < INFECTED) return { open: false, reason: `A new queen flew from ${mother} without you in her: she founds her colony on her mother's doctrine.` };
  if (!revealed[f.mother]) return { open: false, reason: `A new queen flew from ${mother} with you in her, but you never reached ${mother}'s queen: its doctrine is closed to you, so she founds on her mother's doctrine.` };
  if (lock !== null) return { open: false, reason: `A new queen flew from ${mother} with you in her, but Jev can't read new words now (${lock}): she founds on her mother's doctrine.` };
  return { open: true };
}

// One world (U5.2, owner 2026-11-10): the player's queen lands where the player clicks on the top view, within her
// flight (FLIGHT_2D) of her mother's hole; she then settles where the founding rule allows (Game.settleAt), or is lost.

/** The circle she may land in: her mother's hole on the plane (world units) and the flight's reach. */
export interface PenCircle {
  x: number;
  y: number;
  r: number;
}

/** Where a click in the pen sends her: the cell she settles on and the end of the line it grows, or why not. */
export type Settle = { ok: true; cell: Cell; end: End } | { ok: false; reason: string };

/** The pen's circle for flight f in one world: FLIGHT_2D round her mother's hole on the plane; null off one world or with no hole. */
export function flightCircle(game: Game, f: Flight): PenCircle | null {
  if (!game.world) return null;
  const m = game.colonies[f.mother];
  const h = m?.holeCells[m.params.nest];
  return h ? { x: centreX(h.px, h.py), y: centreY(h.py), r: FLIGHT_2D } : null;
}

/** Whether plane point p is inside the circle (its edge included). */
export function withinFlight(c: PenCircle, p: { x: number; y: number }): boolean {
  return Math.hypot(p.x - c.x, p.y - c.y) <= c.r;
}

/**
 * Where a click at plane point p in the pen sends her: outside the circle, refused (she can't fly that far); inside it,
 * where `settle` (Game.settleAt, with the pen's ground) says. `mother` is her mother colony's name.
 */
export function penSettle(c: PenCircle, p: { x: number; y: number }, mother: string, settle: (p: { x: number; y: number }) => Settle): Settle {
  if (!withinFlight(c, p)) return { ok: false, reason: `too far: she flies at most ${c.r} from ${mother}'s hole` };
  return settle(p);
}

const grounds = new WeakMap<Transect, (x: number, y: number) => boolean>();

/**
 * The plane's main open ground for the founding rule (oneWorld.ts mainGround, ~14 ms on the default plane), kept while
 * the line is the same: the pen asks under the pointer, and a founding (the only thing that moves the line or the holes
 * whose ground it is) makes a new line.
 */
export function penGround(world: OneWorld): (x: number, y: number) => boolean {
  let g = grounds.get(world.line);
  if (!g) grounds.set(world.line, (g = mainGround(world)));
  return g;
}
