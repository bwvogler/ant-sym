import { defineSchema, type FieldOf } from "./schema.ts";
import { MODES, STANCES, type Mode, type Stance } from "./vocab.ts";
import type { AntDraw } from "./weighted.ts";

// An ant's responses to what it touches and carries, pure. Choosing a mode is
// the ant's one big decision (colony.ts, a `Policy`); these are the small
// ones that used to be fixed mechanics: whether to pick food up, what to do
// while carrying, whether to put the load down here, which trail to lay and
// how much, how hard to shy from alarm, how loudly to raise it in a fight.
// Each is a function of a small situation (`Touch`), so each can later be a
// cached Jev question asked only when its moment comes, like the mode
// (colonyBrain.ts: RESPONSE_HOOKS). `localResponses` is exactly the colony's
// rules before the hooks (tests/golden/golden.test.ts pins that); later behaviour
// MRs (docs/PRD.md §42) change them one at a time, each against the assays in
// experiment.ts. What the fungus does to an ant (layGain, quiet, gainAlarm…)
// stays outside: it scales what a response decides.

/** What an ant can hold: food, a soil pellet it dug or picked up, a corpse for the midden, or brood it is nursing. */
export const ITEMS = ["none", "food", "soil", "corpse", "brood"] as const;
export type Item = (typeof ITEMS)[number];

/**
 * Where an ant is, as it can tell: out (on the ground away from its hole, or in a stranger's nest), at its hole (the
 * nest's mouth; on a top-down map, the nest), in its own tunnels, or in one of its own chambers.
 */
export const WHERE = ["out", "hole", "tunnel", "chamber"] as const;
export type Where = (typeof WHERE)[number];

/** How good food tastes (docs/trails.md: Beckers et al. 1993): the map's quality, bucketed. */
export const QUALITY = ["poor", "fair", "rich"] as const;
export type Quality = (typeof QUALITY)[number];
/** Quality below this tastes poor, above QUALITY_RICH rich (the game's ordinary food is 1: fair). */
export const QUALITY_POOR = 0.75;
export const QUALITY_RICH = 1.25;
export function qualityOf(q: number): Quality {
  return q < QUALITY_POOR ? "poor" : q > QUALITY_RICH ? "rich" : "fair";
}

/**
 * Trail laid by a food carrier, by the food's quality, as a share of the colony's `deposit` (behaviour MR 3): *Lasius
 * niger* lays about 43 % more trail for 1 M sugar than for 0.05–0.1 M (Beckers et al. 1993; docs/trails.md), so rich
 * lays 1.44× what poor does. The game's ordinary food (fair) keeps 1.
 */
export const TRAIL_BY_QUALITY: Record<Quality, number> = { poor: 0.83, fair: 1, rich: 1.2 };

/**
 * What a response may depend on: few values, so an answer could be cached per situation. The
 * colony fills one shared object per call, so a response must read it and not keep it.
 */
export interface Touch {
  /** Coarse effort on an explicit local delivery, enabled only by deliveryReconsider. Carry alone receives it. */
  deliveryAttempt: "none" | "brief" | "long";
  mode: Mode;
  carrying: Item;
  /** carrying food between chambers (side view, nest slice 5), not home from outside */
  porter: boolean;
  /** an explorer at a soil face, digging */
  digging: boolean;
  /** where it is (see Where) */
  place: Where;
  /** what `get` is offered: food on the ground, a loose soil pellet off the mound, a corpse, brood to nurse ("none" for the other responses) */
  offered: Item;
  /** strangers within the colony's enemy range (always true in a fight) */
  enemy: boolean;
  stance: Stance;
  /** how good the food is, tasted: the food it carries, or the food `get` offers; "fair" otherwise */
  quality: Quality;
  /** the alarm it smells, strongest of its three sensors: none, faint or strong (behaviour MR 4: graded alarm) */
  alarm: (typeof SCENT_LEVELS)[number];
  /**
   * with strangers in contact, nestmates against strangers in its cell and the six round it, by touch (behaviour MR 4):
   * outnumbered (under two thirds as many), even, outnumbering (over half as many again); "none" with no stranger near
   */
  odds: Odds;
  /**
   * nestmates bringing food home it has touched lately, at home (behaviour MR 5, docs/activation.md: Gordon's harvester
   * ants leave on the rate of successful returns): none, few or many; "none" where the colony doesn't gate leaving
   */
  returns: Returns;
  /**
   * the raid trail it smells where it is (behaviour MR 5.2, docs/raid-recruitment.md): none, faint or strong. A colony that
   * doesn't recruit raiders by trail (raidGate 0, or the side view) reads "strong", so its raiders leave as they did.
   */
  raid: (typeof SCENT_LEVELS)[number];
  /**
   * how crowded home is, felt by a waiting ant (docs/stance.md: nestmates in its cell and the six round it, over a few seconds):
   * few or many; "few" where each ant's stance is not its own (the side view)
   */
  crowd: (typeof CROWD)[number];
}

export type Returns = (typeof RETURNS)[number];

/**
 * How soon a rested forager waiting at home goes out (behaviour MR 5): now, soon, or wait (only a scout goes); or raid (docs/stance.md):
 * out, soon, as a raid scout looking for the rival.
 */
export const LEAVE = ["now", "soon", "wait", "raid"] as const;
export type Leave = (typeof LEAVE)[number];

export type Odds = (typeof ODDS)[number];

/** What an ant does on meeting strangers (behaviour MR 4, docs/combat.md). */
export const CONTACT = ["fight", "flee", "drop and run", "ignore"] as const;
export type Contact = (typeof CONTACT)[number];

export type TrailKind = "food" | "home" | "none";

/** Retain/release a load, or (deliveryLane) choose a locally recognised food destination role. */
export const CARRY = ["take", "put down", "to reception", "to store", "to brood", "to royal"] as const;
export type Carry = (typeof CARRY)[number];

/**
 * The ant's small responses. The six a policy can answer (RESPONSE_HOOKS: get, carry, drop, trail, contact, leave) take the
 * ant's `draw` (weighted.ts AntDraw, ja-m7rr): an answer kept with Jev's probabilities is drawn from with it, so ants in one
 * situation answer differently, each keeping its draw while the situation lasts. The local rules never draw.
 */
export interface Responses {
  /** Empty jaws, touching something it could take (`offered`: food, loose soil, a corpse, brood): take it? */
  get(t: Touch, draw?: AntDraw): boolean;
  /**
   * Carrying anything (asked every step while carrying; the mode policy is not asked then): take it where it belongs
   * (food home to the nest's chambers, a porter's to the chamber that wants it, soil out to the mound, a corpse to the
   * midden, brood to a brood chamber), going home to do it; or put it down here, and be asked afresh.
   * With deliveryLane, explicit food roles select a locally sensed destination; take then retains that choice. (Carrying no
   * longer has a mode to choose: told to explore or fight with food in its jaws, an ant stranded it, ja-1pm.)
   */
  carry(t: Touch, draw?: AntDraw): Carry;
  /** Carrying food, at a place it can put it down (the nest on a top-down map; its chamber in the side view): put it down? */
  drop(t: Touch, draw?: AntDraw): boolean;
  /** Which trail to lay this step. */
  trail(t: Touch, draw?: AntDraw): TrailKind;
  /** How much of it, as a share of the colony's `deposit`. */
  trailRate(t: Touch): number;
  /**
   * How hard to steer away from alarm, as a share of the colony's `alarmAvoid` (0 = ignore it); negative steers toward
   * it (behaviour MR 4: a little alarm draws, docs/combat.md).
   */
  alarmGain(t: Touch): number;
  /** In a fight: alarm laid, as a share of the fight's `alarm` rate. */
  raiseAlarm(t: Touch): number;
  /**
   * Strangers within reach (asked every step while they are, `odds` filled in): fight them; flee (home, away from
   * them); or drop what it carries and flee (behaviour MR 4).
   */
  contact(t: Touch, draw?: AntDraw): Contact;
  /**
   * Following a food trail to where it ends, and no food there (behaviour MR 3, docs/trails.md: Robinson et al. 2005):
   * "no entry" laid, as a share of the colony's `deposit` (0 = none).
   */
  noEntry(t: Touch): number;
  /**
   * Rested, empty-jawed and home, where the colony gates leaving: go out now, soon, or wait (only a scout goes out, now
   * and then). `returns` says how many nestmates bringing food it has met lately (behaviour MR 5).
   */
  leave(t: Touch, draw?: AntDraw): Leave;
}

/**
 * The rules before the hooks (behaviour MR 3: trailRate follows the quality of food carried): take food unless fighting (soil, corpses and brood: whenever the mechanic offers them); anything carried is taken where it belongs; put food down
 * where it goes; walking out marks the way home and carrying food the way to it, while soil, corpse and
 * porter carriers lay nothing; shy from alarm unless fighting or digging; always raise it in a fight.
 */
export const localResponses: Responses = {
  get: (t) => t.offered !== "food" || t.mode !== "fight",
  carry: () => "take",
  drop: () => true,
  trail: (t) => (t.porter || t.carrying === "soil" || t.carrying === "corpse" ? "none" : t.carrying === "food" ? "food" : "home"),
  trailRate: (t) => (t.carrying === "food" ? TRAIL_BY_QUALITY[t.quality] : 1),
  // Graded (behaviour MR 4; docs/combat.md: low doses attract, ten times more repel): a faint alarm draws an empty-jawed
  // explorer to see, and a follower keeps to its trail; strong alarm repels everyone but fighters and diggers, as before.
  alarmGain: (t) =>
    t.mode === "fight" || t.digging
      ? 0
      : t.alarm === "faint" && t.carrying === "none"
        ? t.mode === "explore"
          ? -1
          : t.mode === "follow"
            ? 0
            : 1
        : 1,
  raiseAlarm: () => 1,
  noEntry: () => 1,
  // Behaviour MR 4 (docs/combat.md): before it, every ant with a stranger near fought. Now a carrier takes its load home,
  // raiders and defenders fight, and on a forage stance every ant turns away (at food, the ant that didn't start it usually retreats: Human & Gordon
  // 1996). Fighting only while outnumbering was tried: one side always outnumbers somewhere, and its fighters cut down the
  // other's fleers (G′ seeds 1–4: 7,482 lost against 6,069 never fighting). `odds` is there for a policy that weighs it.
  // An ant its mode policy sent to fight (a doctrine's, or a raid's) fights: the local policy no longer sends ants to
  // fight just because strangers are near, and it sends a fighter home once the strangers are gone.
  contact: (t) => (t.carrying !== "none" ? "flee" : t.stance !== "forage" || t.mode === "fight" ? "fight" : "flee"),
  // Behaviour MR 5 (docs/activation.md): a waiting forager goes out on the returns of successful foragers (Gordon;
  // Pinter-Wollman et al. 2013); with none, it waits, and only scouts go. A fighting stance doesn't wait for food.
  // A raider (mode fight) home on a raid stance goes on a scout's trail (behaviour MR 5.2); a forager answers its returns, and a
  // colony that raids or defends sends it out whatever comes back (MR 5).
  // Each ant's own stance (docs/stance.md): a crowded home with no food coming back sends a waiting forager out as a raid scout.
  leave: (t) =>
    t.mode === "fight"
      ? t.stance === "raid" && t.raid === "none"
        ? "wait"
        : "now"
      : t.stance !== "forage" || t.returns === "many"
        ? "now"
        : t.returns === "few"
          ? "soon"
          : t.crowd === "many"
            ? "raid"
            : "wait",
};

/** Responses with some hooks replaced (experiments, tests, cached answers): the rest stay local. */
export function responses(over: Partial<Responses> = {}): Responses {
  return { ...localResponses, ...over };
}

/** The alarm and raid scent an ant smells (Touch.alarm, Touch.raid), the odds round it, the returns it has met and the crowd at home. */
export const SCENT_LEVELS = ["none", "faint", "strong"] as const;
export const ODDS = ["none", "outnumbered", "even", "outnumbering"] as const;
export const RETURNS = ["none", "few", "many"] as const;
export const CROWD = ["few", "many"] as const;

/**
 * Touch's fields, declared once (ja-fnd.5.6): each with its values and how it reads in a cache key. The key fields come first, in
 * key order; porter, digging and enemy read as words, and quality only when it isn't "fair" (so keys from before quality still
 * match). The fields only some lanes are sent read as "name:value" (colonyBrain.responseKey).
 */
const TOUCH_FIELDS: readonly FieldOf<Touch>[] = [
  { name: "deliveryAttempt", values: ["none", "brief", "long"], key: (v) => `deliveryAttempt:${v}` },
  { name: "mode", values: MODES },
  { name: "carrying", values: ITEMS },
  { name: "porter", values: [false, true], key: (v) => (v ? "porter" : "-") },
  { name: "digging", values: [false, true], key: (v) => (v ? "digging" : "-") },
  { name: "place", values: WHERE },
  { name: "offered", values: ITEMS },
  { name: "enemy", values: [false, true], key: (v) => (v ? "enemy" : "clear") },
  { name: "stance", values: STANCES },
  { name: "quality", values: QUALITY, key: (v) => (v === "fair" ? null : v) },
  { name: "alarm", values: SCENT_LEVELS, key: (v) => `alarm:${v}` },
  { name: "odds", values: ODDS, key: (v) => `odds:${v}` },
  { name: "returns", values: RETURNS, key: (v) => `returns:${v}` },
  { name: "raid", values: SCENT_LEVELS, key: (v) => `raid:${v}` },
  { name: "crowd", values: CROWD, key: (v) => `crowd:${v}` },
];

/** Every field of a response situation: what the response legend has words for (colonyBrain.RESPONSE_LEGEND). */
export const TOUCH_SCHEMA = defineSchema<Touch>(TOUCH_FIELDS);

/** A schema over some of Touch's fields, in Touch's order: the key of a lane sent those fields. */
export function touchSchemaOf(names: readonly (keyof Touch)[]) {
  for (const n of names) if (!TOUCH_FIELDS.some((f) => f.name === n)) throw new Error(`touchSchemaOf: no field "${String(n)}"`);
  return defineSchema<Touch>(TOUCH_FIELDS.filter((f) => names.includes(f.name)));
}

/** The fields every response lane is keyed on (the rest go to some lanes only: colonyBrain.responseKey). */
export const TOUCH_KEY_FIELDS = ["mode", "carrying", "porter", "digging", "place", "offered", "enemy", "stance", "quality"] as const;
const TOUCH_KEY = touchSchemaOf(TOUCH_KEY_FIELDS);

/**
 * A situation as a cache key: 4 modes × 5 items × porter × digging × 4 places × 5 offered × enemy × 3 stances, then
 * quality only when it isn't "fair" (so keys from before quality still match: most combinations never occur). Alarm and
 * odds are the contact lane's alone (colonyBrain.responseKey): the other lanes are never sent them.
 */
export function touchKey(t: Touch): string {
  return TOUCH_KEY.key(t);
}
