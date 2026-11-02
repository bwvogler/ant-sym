import type { Mode, Stance, Trail } from "./colony.ts";

// Responses, pure: what an ant does when something happens to it, as hooks
// the colony calls at the moment the event fires. Each hook is a pure
// function of a small view of the ant (what it is doing, what it carries,
// whether it is home, and what its antennae read ahead), so each can later
// be tuned, scripted in an experiment, or asked of Jev as its own cached
// lane (colonyBrain.ts: HOOK_LANES). `localResponses` is the rule the colony
// has always followed, hook for hook; a golden test holds it to that.
//
// When each hook fires:
//   onFood     — standing on food, carrying nothing: take it?
//   onCarry    — just picked something up: which mode to carry it in
//   atSite     — carrying, at the nest: put it down?
//   mark       — every step: which trail to lay
//   onContact  — enemies in the 3×3 cells around: fight, flee, or drop the load and run
//   raiseAlarm — in a fight: how much alarm to lay
//   alarmGain  — smelling alarm: steer away from it, ignore it, or climb it

export const ITEMS = ["none", "food", "soil", "egg"] as const;
/** What an ant carries. Stored per ant as its index (0 = nothing, 1 = food). */
export type Item = (typeof ITEMS)[number];

export const CONTACTS = ["fight", "flee", "drop"] as const;
export type Contact = (typeof CONTACTS)[number];

export const ALARM_LEVELS = ["none", "normal", "strong"] as const;
export type AlarmLevel = (typeof ALARM_LEVELS)[number];
/** Alarm laid per answer, as a share of the fight's alarm rate. */
export const ALARM_GAIN: Record<AlarmLevel, number> = { none: 0, normal: 1, strong: 2 };

export const ALARM_RESPONSES = ["flee", "ignore", "approach"] as const;
export type AlarmResponse = (typeof ALARM_RESPONSES)[number];

export const MARKS = ["food", "home", "none"] as const;
export type MarkChoice = (typeof MARKS)[number];

/**
 * What an ant knows when a hook fires: discrete, so an answer can be cached per view. The colony
 * keeps one per colony and refills it before each call: a hook must not hold on to it.
 */
export interface AntView {
  mode: Mode;
  carrying: Item;
  /** inside the nest's radius */
  atNest: boolean;
  /** out longer than the colony's patience without finding food */
  tired: boolean;
  foodTrail: Trail;
  homeTrail: Trail;
  alarm: Trail;
  /** an ant of another colony within enemyRange cells */
  enemy: "none" | "near";
  stance: Stance;
}

export interface Responses {
  onFood(v: AntView): boolean;
  onCarry(v: AntView): Mode;
  atSite(v: AntView): boolean;
  mark(v: AntView): MarkChoice;
  onContact(v: AntView): Contact;
  raiseAlarm(v: AntView): AlarmLevel;
  alarmGain(v: AntView): AlarmResponse;
}

export type Hook = keyof Responses;
export const HOOKS: Hook[] = ["onFood", "onCarry", "atSite", "mark", "onContact", "raiseAlarm", "alarmGain"];

/**
 * Today's rules, hook for hook. Food is taken unless the ant is fighting; a carrier goes home and
 * puts its load down at the nest; walking out marks the way home and carrying food marks the way
 * to it; every ant in a fight fights and lays alarm; everyone but a fighter shies away from alarm.
 */
export const localResponses: Responses = {
  onFood: (v) => v.mode !== "fight",
  onCarry: () => "return",
  atSite: (v) => v.atNest,
  mark: (v) => (v.carrying === "food" ? "food" : "home"),
  onContact: () => "fight",
  raiseAlarm: () => "normal",
  alarmGain: (v) => (v.mode === "fight" ? "ignore" : "flee"),
};

/** localResponses with some hooks replaced: an experiment's scripted responses. */
export function withResponses(over: Partial<Responses>, base: Responses = localResponses): Responses {
  return { ...base, ...over };
}
