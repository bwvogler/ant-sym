import { INFECTED, PLANE, type Colony, type Game } from "../colony/index.ts";
import { colonyName } from "./names.ts";

// The first game's tutorial (ja-7x4, PRD §61): the landing, the first ant the fungus gets into, paused and followed
// until its nestmates groom it clean, then the aim. A pure machine (no React, no DOM): the page feeds it what the game
// shows each frame (`seen`) and applies what it returns (`Effect`); `node --test` drives it the same way.

export type TutorialStep = "landing" | "waiting" | "host" | "watch" | "cleared" | "died" | "timeout" | "aim" | "done";

/** One ant, as follow.ts names it: colony, slot, and the slot's generation (a reused slot is another ant). */
export interface HostRef {
  k: number;
  i: number;
  gen: number;
}

export interface Tutorial {
  step: TutorialStep;
  /** the ant the tutorial follows: the first host, found by the tutorial (not the player's follow) */
  host: HostRef | null;
  /** sim seconds when the watch began */
  watchFrom: number;
  /** the host has been below (off the plane) during the watch */
  below: boolean;
  /** running at FAST_SPEED until the next card (the player pressed Faster) */
  fast: boolean;
  /** ants of the landing colony carrying the fungus when the watch ended (the outcome cards say it) */
  hosts: number;
}

/** What the game shows this frame, as the tutorial reads it. */
export interface Seen {
  time: number;
  /** a colony-0 ant carrying the fungus (load ≥ INFECTED), if any: the candidate first host */
  candidate: HostRef | null;
  /** the tutorial's host, if it has one: still the same ant, its load and its layer */
  host: { alive: boolean; load: number; layer: number } | null;
  /** ants of the landing colony carrying the fungus now */
  hosts: number;
}

/** What the page does: play or pause, a speed, an ant to follow, the tutorial finished. */
export interface Effect {
  playing?: boolean;
  speed?: number;
  follow?: HostRef;
  done?: boolean;
}

/** The game's own speed, given back when the tutorial ends (useColony GAME_SPEED; kept here to keep this file React-free). */
export const AFTER_SPEED = 4;
/** The tutorial's speed: 1×, so a step can be seen. */
export const TUTORIAL_SPEED = 1;
/** "Faster" while waiting or watching. */
export const FAST_SPEED = 4;
/**
 * Sim seconds of watching before the tutorial moves on without a clean host. Measured (scripts/tutorial-first-host.mjs,
 * seeds 1–20, PRD §61): every first host was groomed clean, 41–215 s after it was found (median about 100 s); the limit
 * is above the worst seed, so the timeout card is for a world unlike those.
 */
export const WATCH_LIMIT = 240;

export const begin = (): Tutorial => ({ step: "landing", host: null, watchFrom: 0, below: false, fast: false, hosts: 0 });

/** The steps that wait on the game (it plays) rather than on the player (it is paused). */
const LIVE: ReadonlySet<TutorialStep> = new Set(["waiting", "watch"]);
export const isLive = (t: Tutorial): boolean => LIVE.has(t.step);

/** What the game did, read frame by frame: a first host found, then it clean, dead, or still carrying past the limit. */
export function observe(t: Tutorial, seen: Seen): { t: Tutorial; effect?: Effect } {
  if (t.step === "waiting" && seen.candidate)
    return { t: { ...t, step: "host", host: seen.candidate, fast: false }, effect: { playing: false, follow: seen.candidate } };
  if (t.step !== "watch") return { t };
  const h = seen.host;
  const end = (step: TutorialStep) => ({ t: { ...t, step, fast: false, hosts: seen.hosts }, effect: { playing: false } });
  // The tutorial's host is its own: the player unfollowing it is not the ant dying (h stays as long as the ant lives).
  if (!h || !h.alive) return end("died");
  if (h.load === 0) return end("cleared");
  if (seen.time - t.watchFrom >= WATCH_LIMIT) return end("timeout");
  if (!t.below && h.layer !== PLANE) return { t: { ...t, below: true } };
  return { t };
}

/** Faster, on a live step: FAST_SPEED until the next card. */
export function faster(t: Tutorial): { t: Tutorial; effect: Effect } {
  return isLive(t) ? { t: { ...t, fast: true }, effect: { speed: FAST_SPEED } } : { t, effect: {} };
}

/** The player pressed the card's button. */
export function next(t: Tutorial, time: number): { t: Tutorial; effect: Effect } {
  switch (t.step) {
    case "landing":
      return { t: { ...t, step: "waiting", fast: false }, effect: { playing: true, speed: TUTORIAL_SPEED } };
    case "host":
      return {
        t: { ...t, step: "watch", watchFrom: time, fast: false },
        effect: { playing: true, speed: TUTORIAL_SPEED, ...(t.host ? { follow: t.host } : {}) },
      };
    case "cleared":
    case "died":
    case "timeout":
      return { t: { ...t, step: "aim" }, effect: {} };
    default:
      return { t: { ...t, step: "done" }, effect: finish };
  }
}

/** Skip, or the last card's button: the game's own speed, playing, and never shown again. */
export const finish: Effect = { playing: true, speed: AFTER_SPEED, done: true };

/** The first living ant of colony `k` carrying the fungus, or null. */
export function firstHost(c: Colony, k: number): HostRef | null {
  for (let i = 0; i < c.n; i++) if (c.alive[i] && c.load[i] >= INFECTED) return { k, i, gen: c.gen[i] };
  return null;
}

/** What `game` shows the tutorial now. Cheap: it scans for a candidate only while waiting. */
export function seenOf(game: Game, t: Tutorial): Seen {
  const k = game.landed?.colony ?? 0;
  const c = game.colonies[k];
  if (!c) return { time: game.time, candidate: null, host: null, hosts: 0 };
  const h = t.host;
  const same = h && game.colonies[h.k] === c ? c.alive[h.i] === 1 && c.gen[h.i] === h.gen : false;
  return {
    time: game.time,
    candidate: t.step === "waiting" ? firstHost(c, k) : null,
    host: h ? { alive: same, load: same ? c.load[h.i] : 0, layer: same ? c.layer[h.i] : PLANE } : null,
    hosts: t.step === "waiting" ? 0 : game.fungus.census(c).infected,
  };
}

/** Where the card points: the followed ant's load, the fungus's mutations, its aim. */
export type Highlight = "load" | "evolution" | "aim";

export interface Card {
  title: string;
  body: string[];
  /** the button's words; null: the game decides when it moves on (a live step) */
  next: string | null;
  highlight?: Highlight;
  /** a live step offers to run faster until something happens */
  faster?: boolean;
  /** a guide entry to read more (Learn) */
  learn?: string;
}

/** The card for step `t`, in the words a new player reads. */
export function cardFor(t: Tutorial, landing = 0): Card {
  const ink = colonyName(landing);
  const ant = t.host ? `Ant #${t.host.i}` : "The ant";
  const passed =
    t.hosts > 1
      ? `While it carried you, it passed you on: ${t.hosts} ${ink} ants carry you now.`
      : "Your mycelium by the hole keeps fruiting, so other ants will pick you up.";
  switch (t.step) {
    case "landing":
      return {
        title: "You are a fungus",
        body: [
          `The purple specks by the ${ink} colony's hole are your spores. You can't move. You wait for an ant to walk through you.`,
          "The game is paused, and runs at 1× while this tutorial shows you around.",
        ],
        next: "Let it play",
      };
    case "waiting":
      return {
        title: "Watch the hole",
        body: [`${ink} ants come and go through it. One of them will step in your spores.`],
        next: null,
        faster: true,
      };
    case "host":
      return {
        title: `${ant} carries you`,
        body: [
          `It walked through your spores and picked you up: you are inside it now (the purple dot). Its card below shows how much of it is you.`,
          "You never steer it. It goes about its work as before, and takes you with it.",
        ],
        next: "Follow it",
        highlight: "load",
      };
    case "watch":
      return {
        title: "Its nestmates groom it",
        body: [
          "Ants lick each other clean. Each time a nestmate grooms it, some of you comes off, and the groomer learns your smell: it resists you a little more.",
          ...(t.below ? ["It has taken you down the hole into the nest: the view switched to below."] : []),
          "Watch its share of you on the card.",
        ],
        next: null,
        highlight: "load",
        faster: true,
      };
    case "cleared":
      return {
        title: `${ant} is clean`,
        body: [
          "Grooming took you off it, and your strain clears fast on its own: it starts weak, as every strain does here.",
          passed,
          "Mutations come as your body grows. Spend them in the fungus panel: Persistence makes you clear slowly, Stealth hides you from groomers.",
        ],
        next: "Next",
        highlight: "evolution",
        learn: "evolution",
      };
    case "died":
      return {
        title: `${ant} died`,
        body: ["A dead ant carries you nowhere: a host is only worth what it touches while it lives.", passed],
        next: "Next",
        learn: "fungus",
      };
    case "timeout":
      return {
        title: `${ant} still carries you`,
        body: [
          "Its nestmates keep grooming it; as long as some of you is left, it passes you on to the ants it touches.",
          passed,
          "Mutations come as your body grows. Spend them in the fungus panel: Persistence makes you clear slowly, Stealth hides you from groomers.",
        ],
        next: "Next",
        highlight: "evolution",
        learn: "evolution",
      };
    case "aim":
      return {
        title: "Your aim",
        body: [
          "You don't decide what an ant does. You say what the fungus wants, here, in words; Jev reads them and decides, in each ant you are in, what that ant perceives and what it gives off.",
          "Pick a preset or write your own. The goal line at the top says what to do next.",
        ],
        next: "Play at 4×",
        highlight: "aim",
      };
    default:
      return { title: "", body: [], next: null };
  }
}

/** The done flag, in the browser (per viewer). Storage may throw or be gone: then the tutorial just shows again. */
const KEY = "jev-ants.tutorial";
export function tutorialDone(store: Pick<Storage, "getItem"> | null): boolean {
  try {
    return store?.getItem(KEY) === "done";
  } catch {
    return false;
  }
}
export function markTutorialDone(store: Pick<Storage, "setItem"> | null): void {
  try {
    store?.setItem(KEY, "done");
  } catch {
    // private window or blocked storage: nothing to remember it in
  }
}
