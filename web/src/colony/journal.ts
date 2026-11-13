// The game journal (ja-8tb): what happens in a game, as events, for a developer watching it. Off by default. It is an
// observer: `observe(game)` after a tick diffs what the game shows (each ant's alive, gen, mode and load; each colony's
// stance and queen; the colonies; the outcome) against what it saw last time, and writes an event for each change.
// It reads only: it draws no random numbers and writes no game state, so a game played with a journal is the game
// played without one (tests/unit/journal.test.ts holds that). Code outside the game (the page's Jev lanes) adds its
// own events with `note`.
//
// Levels pick categories: "summary" is what happens to colonies (founded, fallen, stance, queen, Jev batches),
// "detail" adds what happens to each ant's life (births, deaths, infections), "verbose" adds every mode change, with
// the situation its policy was asked. A filter can name categories instead, and narrow to one colony or one ant.
// Mode changes are many: the 1200-ant side game writes ~1500 a second (885k in 600 s, 300 MB of JSONL), so read them
// with ant=<i>.
import { pastCritical } from "./heat.ts";
import type { Colony } from "./colony.ts";
import { INFECTED } from "./fungus.ts";
import { Game, type Outcome } from "./game.ts";
import { MODES, type Situation, type Stance } from "./vocab.ts";

export const JOURNAL_CATEGORIES = ["colony", "queen", "stance", "jev", "birth", "death", "mode", "infection"] as const;
export type JournalCategory = (typeof JOURNAL_CATEGORIES)[number];

export const JOURNAL_LEVELS = ["off", "summary", "detail", "verbose"] as const;
export type JournalLevel = (typeof JOURNAL_LEVELS)[number];

const LEVEL_CATEGORIES: Record<JournalLevel, readonly JournalCategory[]> = {
  off: [],
  summary: ["colony", "queen", "stance", "jev"],
  detail: ["colony", "queen", "stance", "jev", "birth", "death", "infection"],
  verbose: JOURNAL_CATEGORIES,
};

export interface JournalEvent {
  /** sim seconds */
  t: number;
  cat: JournalCategory;
  /** the colony's index in game.colonies; -1 for the game as a whole */
  colony: number;
  /** the ant's slot, for an ant's event; with `gen`, it names one ant even after its slot is reused */
  ant?: number;
  gen?: number;
  text: string;
  /** the numbers behind the text (a mode change's situation, a death's age and load, …) */
  data?: Record<string, unknown>;
}

export interface JournalFilter {
  categories: ReadonlySet<JournalCategory>;
  /** only this colony's events (and the game's own, colony -1) */
  colony?: number;
  /** only this ant slot's events (and every colony-level event) */
  ant?: number;
}

/**
 * A filter from a short spec, as `?log=` and `--log` take it: comma-separated levels, categories and `colony=k`,
 * `ant=i`. "summary", "verbose", "death,mode", "verbose,ant=42", "mode,colony=1". Categories add to a level. Empty or
 * "off": nothing. Throws on a word it doesn't know, so a typo says so instead of logging nothing.
 */
export function parseJournalSpec(spec: string): JournalFilter {
  const categories = new Set<JournalCategory>();
  const f: { colony?: number; ant?: number } = {};
  for (const raw of spec.split(",")) {
    const w = raw.trim();
    if (!w) continue;
    const eq = w.indexOf("=");
    if (eq > 0) {
      const key = w.slice(0, eq);
      const v = Number(w.slice(eq + 1));
      if ((key !== "colony" && key !== "ant") || !Number.isInteger(v) || v < 0)
        throw new Error(`journal: "${w}" (want colony=<k> or ant=<i>)`);
      f[key] = v;
    } else if ((JOURNAL_LEVELS as readonly string[]).includes(w)) for (const c of LEVEL_CATEGORIES[w as JournalLevel]) categories.add(c);
    else if ((JOURNAL_CATEGORIES as readonly string[]).includes(w)) categories.add(w as JournalCategory);
    else throw new Error(`journal: unknown "${w}" (levels: ${JOURNAL_LEVELS.join(", ")}; categories: ${JOURNAL_CATEGORIES.join(", ")})`);
  }
  // An ant or colony alone means everything about it.
  if (categories.size === 0 && (f.ant !== undefined || f.colony !== undefined)) for (const c of JOURNAL_CATEGORIES) categories.add(c);
  return { categories, ...f };
}

/** One line for a console or a file: "  12.3s  c0 #42  mode  explore → follow". */
export function formatJournalEvent(e: JournalEvent): string {
  const who = `${e.colony < 0 ? "game" : `c${e.colony}`}${e.ant === undefined ? "" : ` #${e.ant}`}`;
  return `${e.t.toFixed(1).padStart(7)}s  ${who.padEnd(9)} ${e.cat.padEnd(9)} ${e.text}`;
}

/** What the journal saw of one colony last time. */
interface Seen {
  colony: Colony;
  alive: Uint8Array;
  gen: Uint32Array;
  mode: Uint8Array;
  infected: Uint8Array;
  stance: Stance;
  queen: boolean | null;
  fallen: boolean;
}

/** The situation as one short line: the fields that differ from a calm, trail-less one. */
function situationText(s: Situation): string {
  const parts = [
    s.tired ? "tired" : "",
    `food ${s.foodTrail}`,
    `home ${s.homeTrail}`,
    s.alarm !== "none" ? `alarm ${s.alarm}` : "",
    s.enemy === "near" ? "enemy near" : "",
  ];
  return parts.filter(Boolean).join(", ");
}

const OUTCOME_EVERY = 1; // sim seconds between outcome checks: unity() reads every ant

export class Journal {
  readonly filter: JournalFilter;
  /** the newest events, at most `limit` of them (older ones fall off the front) */
  readonly events: JournalEvent[] = [];
  readonly limit: number;
  /** events written since the journal began, including those that fell off */
  written = 0;
  #seen: Seen[] = [];
  #game: Game | null = null;
  #outcome: Outcome = "playing";
  #outcomeAt = -Infinity;
  #listeners = new Set<(e: JournalEvent) => void>();

  constructor(filter: JournalFilter | string, limit = 5000) {
    this.filter = typeof filter === "string" ? parseJournalSpec(filter) : filter;
    this.limit = limit;
  }

  /** Whether anything would be written: a journal with no categories observes nothing. */
  get on(): boolean {
    return this.filter.categories.size > 0;
  }

  /** Called with every event the filter keeps, as it is written (the page's console mirror; a script's file). */
  subscribe(fn: (e: JournalEvent) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /** An event from outside the game (the page's Jev lanes), at the game's time. Kept only if the filter keeps it. */
  note(cat: JournalCategory, colony: number, text: string, data?: Record<string, unknown>, t = this.#game?.time ?? 0): void {
    this.#write({ t, cat, colony, text, ...(data ? { data } : {}) });
  }

  /** Whether the filter keeps an event (an ant filter is applied where ants are read: observe reads only that ant). */
  #wants(cat: JournalCategory, colony: number): boolean {
    const f = this.filter;
    if (!f.categories.has(cat)) return false;
    if (f.colony !== undefined && colony >= 0 && colony !== f.colony) return false;
    return true;
  }

  #write(e: JournalEvent): void {
    if (!this.#wants(e.cat, e.colony)) return;
    this.events.push(e);
    this.written++;
    if (this.events.length > this.limit) this.events.splice(0, this.events.length - this.limit);
    for (const fn of this.#listeners) fn(e);
  }

  /** Diff the game against what was seen last time, and write what changed. Call it after each tick. */
  observe(game: Game): void {
    if (!this.on) return;
    const first = game !== this.#game;
    if (first) {
      // A new game (the page starts one; a save loads): start afresh, without an event for every ant already there.
      this.#game = game;
      this.#seen = [];
      this.#outcome = game.outcome();
      this.#outcomeAt = game.time;
    }
    const t = game.time;
    game.colonies.forEach((c, k) => {
      let s = this.#seen[k];
      if (!s || s.colony !== c) {
        s = this.#seen[k] = this.#snapshot(c);
        this.#write({
          t,
          cat: "colony",
          colony: k,
          text: first ? `${c.population} ants` : `founded with ${c.population} ants`,
          data: { population: c.population },
        });
        return;
      }
      this.#colony(game, c, k, s);
    });
    if (t - this.#outcomeAt >= OUTCOME_EVERY) {
      this.#outcomeAt = t;
      const o = game.outcome();
      if (o !== this.#outcome) this.#write({ t, cat: "colony", colony: -1, text: `outcome: ${this.#outcome} → ${o}` });
      this.#outcome = o;
    }
  }

  #snapshot(c: Colony): Seen {
    const infected = new Uint8Array(c.n);
    for (let i = 0; i < c.n; i++) infected[i] = c.alive[i] && c.load[i] >= INFECTED ? 1 : 0;
    return {
      colony: c,
      alive: c.alive.slice(),
      gen: c.gen.slice(),
      mode: c.mode.slice(),
      infected,
      stance: c.stance,
      queen: c.queen ? c.queen.alive : null,
      fallen: false,
    };
  }

  #colony(game: Game, c: Colony, k: number, s: Seen): void {
    const t = game.time;
    if (c.stance !== s.stance) {
      this.#write({ t, cat: "stance", colony: k, text: `${s.stance} → ${c.stance}`, data: { from: s.stance, to: c.stance } });
      s.stance = c.stance;
    }
    const queen = c.queen ? c.queen.alive : null;
    if (queen !== s.queen) {
      if (queen === false)
        this.#write({ t, cat: "queen", colony: k, text: "the queen died: the colony is orphaned", data: { load: c.queen?.load } });
      s.queen = queen;
    }
    // Every colony, a founded one too (its fall doesn't end the game, Game.fallen, but it is still news).
    const beaten = Game.beaten(c);
    if (beaten && !s.fallen) this.#write({ t, cat: "colony", colony: k, text: "fallen" });
    s.fallen = beaten;
    const f = this.filter;
    const ants = f.categories.has("birth") || f.categories.has("death") || f.categories.has("mode") || f.categories.has("infection");
    if (!ants) return;
    if (f.colony !== undefined && f.colony !== k) return;
    const from = f.ant ?? 0;
    const to = f.ant !== undefined ? Math.min(f.ant + 1, c.n) : c.n;
    for (let i = from; i < to; i++) {
      const alive = c.alive[i];
      const born = alive && (!s.alive[i] || c.gen[i] !== s.gen[i]);
      if (s.alive[i] && (!alive || c.gen[i] !== s.gen[i])) this.#death(c, k, i, s);
      if (born)
        this.#write({ t, cat: "birth", colony: k, ant: i, gen: c.gen[i], text: `born (${MODES[c.mode[i]]})`, data: { layer: c.layer[i] } });
      if (alive && !born && c.mode[i] !== s.mode[i]) {
        const q = c.lastQuestion(i);
        this.#write({
          t,
          cat: "mode",
          colony: k,
          ant: i,
          gen: c.gen[i],
          text: `${MODES[s.mode[i]]} → ${MODES[c.mode[i]]}${q ? `  (${situationText(q)})` : ""}`,
          data: { from: MODES[s.mode[i]], to: MODES[c.mode[i]], ...(q ? { situation: q } : {}), x: c.x[i], y: c.y[i], layer: c.layer[i] },
        });
      }
      // Infected at INFECTED, cleared only below half of it: a load that hovers at the line (grooming against pickup) is one infection, not one a second.
      const was = born ? 0 : s.infected[i];
      const infected = !alive ? 0 : was ? (c.load[i] >= INFECTED / 2 ? 1 : 0) : c.load[i] >= INFECTED ? 1 : 0;
      if (alive && !born && infected !== was)
        this.#write({
          t,
          cat: "infection",
          colony: k,
          ant: i,
          gen: c.gen[i],
          text: infected ? `infected (load ${c.load[i].toFixed(2)})` : `cleared (load ${c.load[i].toFixed(2)})`,
          data: { load: c.load[i], strain: c.strain[i] },
        });
      s.alive[i] = alive;
      s.gen[i] = c.gen[i];
      s.mode[i] = c.mode[i];
      s.infected[i] = infected;
    }
  }

  /** Ant i of colony k died this tick (or its slot was reused): why, as far as its arrays tell. */
  #death(c: Colony, k: number, i: number, s: Seen): void {
    // A dead ant's arrays keep their last values until its slot is reused; a reused slot's are the newborn's.
    const reused = c.gen[i] !== s.gen[i];
    const cause = reused ? "died" : c.age[i] > c.lifespan[i] ? "died of old age" : c.energy[i] <= 0 ? "starved" : c.params.heatDay > 0 && pastCritical(c.params, c.bodyHeat[i]!) ? "died of heat" : "killed";
    const data = reused ? {} : { age: c.age[i], load: c.load[i], mode: MODES[c.mode[i]], x: c.x[i], y: c.y[i], layer: c.layer[i] };
    this.#write({ t: this.#game?.time ?? 0, cat: "death", colony: k, ant: i, gen: s.gen[i], text: cause, data });
  }
}
