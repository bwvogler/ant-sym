import { INFECTED } from "../colony/fungus.ts";
import type { Flight } from "../colony/royal.ts";

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
