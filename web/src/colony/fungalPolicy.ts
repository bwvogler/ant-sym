import { MODES, type Mode } from "./colony.ts";

// The fungus policy, pure (ja-t4d.5, docs/fungus-policy.md §5): what the
// fungus does to each ant it lives in. It never decides for an ant; it picks
// one intervention per host, from what the fungus in that host can sense.
// The host's own policy (the local rule, or Jev under its colony's doctrine)
// still chooses everything the ant does, from the state the fungus bends.
//
// The fungal situation is coarse, so an answer can be cached per situation
// (the Jev lane, fungusBrain.ts), like an ant's mode:
//   strain   — which strain the host carries (it decides what is offered)
//   load     — low / mid / high
//   host     — what the ant is doing: its mode (a carrier counts as return)
//   ground   — whose home scent is on the ground there: home, border, foreign
//   contact  — who touches it: none; kin (its own colony); allied (another
//              colony's ants, within tolerance: unification, felt where it
//              happens); or strangers (past tolerance, by odour)
//   groomed  — whether its nestmates are grooming the fungus off it
// All of it local to the host, like an ant's own senses: the fungus knows
// nothing map-wide (no "how far apart are the nests"), and nothing here
// assumes two colonies. Unity is the player's meter, not the fungus's sense.

export const LOADS = ["low", "mid", "high"] as const;
export type Load = (typeof LOADS)[number];
export const GROUNDS = ["home", "border", "foreign"] as const;
export type Ground = (typeof GROUNDS)[number];
export const CONTACTS = ["none", "kin", "allied", "strangers"] as const;
export type Contact = (typeof CONTACTS)[number];

export interface FungalSituation {
  /** the strain's id */
  strain: string;
  load: Load;
  host: Mode;
  ground: Ground;
  contact: Contact;
  groomed: boolean;
}

/** An intervention's id, for the host the situation describes. */
export type FungusPolicy = (s: FungalSituation) => string;

/** Situations per strain: 3 × 4 × 3 × 4 × 2 = 288. */
export const FUNGAL_SITUATIONS = LOADS.length * MODES.length * GROUNDS.length * CONTACTS.length * 2;

export function loadLevel(l: number): Load {
  return l >= 0.7 ? "high" : l >= 0.3 ? "mid" : "low";
}

/** The fungal situation without its strain, as one number (0 .. FUNGAL_SITUATIONS − 1): what a host keeps of what it was last asked. */
export function encodeFungal(s: Omit<FungalSituation, "strain">): number {
  return (((LOADS.indexOf(s.load) * MODES.length + MODES.indexOf(s.host)) * GROUNDS.length + GROUNDS.indexOf(s.ground)) * CONTACTS.length + CONTACTS.indexOf(s.contact)) * 2 + (s.groomed ? 1 : 0);
}

export function decodeFungal(code: number, strain: string): FungalSituation {
  let c = code;
  const groomed = c % 2 === 1;
  c = Math.floor(c / 2);
  const contact = CONTACTS[c % CONTACTS.length] as Contact;
  c = Math.floor(c / CONTACTS.length);
  const ground = GROUNDS[c % GROUNDS.length] as Ground;
  c = Math.floor(c / GROUNDS.length);
  const host = MODES[c % MODES.length] as Mode;
  const load = LOADS[Math.floor(c / MODES.length)] as Load;
  return { strain, load, host, ground, contact, groomed };
}

/** The local rule's settings: the player's thresholds on the free policy (§5.1, lever 5). */
export interface FungusRule {
  /** a groomed host goes dormant, where it shows a quarter as much (DORMANT_SHOW): it hides from grooming instead of acting */
  hide: boolean;
  /** a high-load host fighting strangers is culled (odour weapon), where the strain and the menu allow it */
  cull: boolean;
}

/** Hiding starts off: at a nest, every visible host is groomed, and a Garden host that hid there would never carry its odour home. */
export const DEFAULT_RULE: FungusRule = { hide: false, cull: false };

/** A policy's answer meaning "what this host's strain does by default" (Fungus.choose resolves it). */
export const STRAIN_DEFAULT = "default";

/**
 * The local rule: free, the default, and the baseline Jev is measured against.
 *   groomed, and hiding → dormant (a dormant host shows a quarter as much to its groomers)
 *   culling, a high-load host fighting strangers → cull
 *   otherwise → the strain's own default (Lockpick soothes, Bloom shares, Garden blends)
 * What a strain cannot do, or the menu has switched off, falls back (Fungus.choose).
 *
 * Why so little (PRD §19): four situational rules were built and measured against each strain's default
 * (sharing routes and roaming away from home, soothing strangers, sequencing them by how close the
 * colonies are, and switching only once unified; the last two read a map-wide "how far apart are the
 * nests", since removed: the fungus senses only what is local to its host). None beat the default; most unified later and cost
 * lives, because any intervention that takes a Garden host off blend before the colonies are one
 * brings less of the fungus's odour home, and after unification shared routes brought in no more
 * food. Situational play is what the per-host situation is for: the player's settings here, and Jev
 * under the player's aim (fungusBrain.ts).
 */
export function localFungusRule(rule: FungusRule = DEFAULT_RULE): FungusPolicy {
  return (s) => {
    if (rule.hide && s.groomed) return "dormant";
    if (rule.cull && s.contact === "strangers" && s.host === "fight" && s.load === "high") return "cull";
    return STRAIN_DEFAULT;
  };
}
