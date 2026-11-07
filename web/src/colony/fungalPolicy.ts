// The fungus policy, pure (ja-t4d.5; redesigned for the fungus game, ja-lo8.4, docs/fungus-policy.md §11): what the
// fungus does to each ant it lives in. It never decides for an ant; it sets a level for each of its levers in that
// host, from what the fungus in that host can sense. The host's own policy (the local rule, or Jev under its
// colony's doctrine) still chooses everything the ant does, from the state the fungus bends.
//
// The fungal situation is what the fungus senses inside its host: its body, not its decisions (the host's mode is
// not a sense: §11.2), and nothing map-wide.
//   arousal  — calm; alarmed (it perceives alarm); fighting (it perceives strangers close: the state it fights in)
//   touch    — who touches its cuticle, by smell: none, a nestmate, a foreigner (an ant that smells of another colony,
//              tolerated or not; by odour, not by colony: PR #42 review S4)
//   place    — the substrate underfoot: outside, a tunnel, a chamber, or by the queen (her mark on the floor)
//   task     — its physiology (juvenile hormone tracks task): nurse, inside worker, forager; or a queen (ja-lo8.7)
//   carrying — what is in its jaws: nothing, food, brood
//   groomed  — nestmates grooming the fungus off its cuticle
// Coarse, so an answer is cached per situation (the Jev lane, fungusBrain.ts) and asked only as hosts meet it.

export const AROUSALS = ["calm", "alarmed", "fighting"] as const;
export type Arousal = (typeof AROUSALS)[number];
export const TOUCHES = ["none", "nestmate", "foreigner"] as const;
export type Touch = (typeof TOUCHES)[number];
export const PLACES = ["outside", "tunnel", "chamber", "queen"] as const;
export type Place = (typeof PLACES)[number];
export const TASKS = ["nurse", "inside", "forager", "queen"] as const;
export type Task = (typeof TASKS)[number];
export const CARRYING = ["nothing", "food", "brood"] as const;
export type Carrying = (typeof CARRYING)[number];

export interface FungalSituation {
  arousal: Arousal;
  touch: Touch;
  place: Place;
  task: Task;
  carrying: Carrying;
  groomed: boolean;
}

/**
 * The fungus's policy: for a host in this situation, Jev's levels as a cache answer (levers.encodeLevels over the levers
 * asked), a preset's id (levers.PRESETS: the local rule's answers), or STRAIN_DEFAULT.
 */
export type FungusPolicy = (s: FungalSituation) => string;

/** Situations: 3 × 3 × 4 × 4 × 3 × 2 = 864 (a queen's are a few of them: she is always by herself, at home). */
export const FUNGAL_SITUATIONS = AROUSALS.length * TOUCHES.length * PLACES.length * TASKS.length * CARRYING.length * 2;

/** A load at or past this is "high": where cull takes full effect (Fungus.express). */
export const HIGH_LOAD = 0.7;

/** The fungal situation as one number (0 .. FUNGAL_SITUATIONS − 1): what a host keeps of what it was last asked. */
export function encodeFungal(s: FungalSituation): number {
  return (((((AROUSALS.indexOf(s.arousal) * TOUCHES.length + TOUCHES.indexOf(s.touch)) * PLACES.length + PLACES.indexOf(s.place)) * TASKS.length + TASKS.indexOf(s.task)) * CARRYING.length + CARRYING.indexOf(s.carrying)) * 2) + (s.groomed ? 1 : 0);
}

export function decodeFungal(code: number): FungalSituation {
  let c = code;
  const groomed = c % 2 === 1;
  c = Math.floor(c / 2);
  const carrying = CARRYING[c % CARRYING.length] as Carrying;
  c = Math.floor(c / CARRYING.length);
  const task = TASKS[c % TASKS.length] as Task;
  c = Math.floor(c / TASKS.length);
  const place = PLACES[c % PLACES.length] as Place;
  c = Math.floor(c / PLACES.length);
  const touch = TOUCHES[c % TOUCHES.length] as Touch;
  const arousal = AROUSALS[Math.floor(c / TOUCHES.length)] as Arousal;
  return { arousal, touch, place, task, carrying, groomed };
}

/** The local rule's settings: the player's thresholds on the free policy (§5.1, lever 5). */
export interface FungusRule {
  /** a groomed host hides (the dormant preset: it shows a quarter as much) instead of acting */
  hide: boolean;
  /** a host fighting a foreigner is culled (the odour weapon), where the menu allows it */
  cull: boolean;
}

/** Hiding starts off: at a nest, every visible host is groomed, and a Garden host that hid there would never carry its odour home. */
export const DEFAULT_RULE: FungusRule = { hide: false, cull: false };

/** A policy's answer meaning "what this host's strain does by default" (Fungus.choose resolves it). */
export const STRAIN_DEFAULT = "default";

/**
 * The local rule: free, the default, and the baseline Jev is measured against. It answers with presets:
 *   groomed, and hiding → dormant (a dormant host shows a quarter as much to its groomers)
 *   culling, a host fighting a foreigner → cull
 *   otherwise → the strain's own default (Lockpick soothes, Bloom shares, Garden blends)
 * Levers the menu has off are left as they are (Fungus.choose).
 *
 * Why so little (PRD §19): four situational rules were built and measured against each strain's default; none beat
 * it. Situational play is what the per-host situation is for: Jev, under the player's aim (fungusBrain.ts).
 */
export function localFungusRule(rule: FungusRule = DEFAULT_RULE): FungusPolicy {
  return (s) => {
    if (rule.hide && s.groomed) return "dormant";
    if (rule.cull && s.touch === "foreigner" && s.arousal === "fighting") return "cull";
    return STRAIN_DEFAULT;
  };
}
