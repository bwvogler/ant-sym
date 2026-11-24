// Who is awake (docs/endless-world.md §6, PRD §66 E4.2, `ja-qpv.3.2`), pure: the rule that says which colonies sleep, from facts the game
// reads each second, with no game in it. The game freezes and thaws (Game.freeze, E4.1) what this says.
//
//   groups   colonies whose ants have been in sensing range of each other in the last T seconds freeze and wake together, so two neighbours that
//            forage over each other's ground cannot keep each other awake for good
//   wake     a sleeping group wakes when the awake fungus comes within W of one of its holes, or an awake host enters a member's nest ground; a host
//            merely foraging past wakes nothing, and no ant of a colony wakes another colony
//   freeze   an awake group freezes when no member has had the awake fungus within W of its hole for T seconds
//   cap      at most `cap` colonies are awake: when a wake would pass it, the lowest-ranked awake groups freeze whole (rank: how long since the fungus
//            last touched the colony), and a colony the cap froze may not wake for T; when room comes back the highest-ranked cap-frozen group that
//            still holds the fungus wakes, once its T has passed. A group larger than the cap may run over it (counted).
//
// The numbers are the design's proposals (§6, §10), parameters here; the owner's answer is `ja-dv98`.

export interface SleepParams {
  // `distance`, `nestGround` and `every` are read by the game, which makes the inputs; the rule itself reads only `delay` and `cap`.
  /** W: how near the awake fungus must come to a hole to wake its colony, and to keep it awake, in cells (2 U) */
  distance: number;
  /** T: seconds of contact memory, of the fungus's absence before a colony freezes, and of a cap-frozen colony's lock */
  delay: number;
  /** the disc round a hole an awake host must enter to wake its colony, in cells */
  nestGround: number;
  /** the most colonies awake at once */
  cap: number;
  /** seconds between decisions (the game asks this often) */
  every: number;
}

export const DEFAULT_SLEEP: SleepParams = { distance: 280, delay: 90, nestGround: 16, cap: 6, every: 1 };

/** What the game read this second, per colony (by index). */
export interface SleepInputs {
  time: number;
  /** which colonies sleep now */
  asleep: readonly boolean[];
  /** the awake fungus (its body, on the plane or in an awake curtain) is within W of this colony's hole */
  near: readonly boolean[];
  /** an awake host is inside this colony's nest ground */
  entered: readonly boolean[];
  /** a sleeping colony still holds the fungus: its hosts sleep with it, or the fungus's body lies in its curtain */
  holds: readonly boolean[];
  /** whether colony a's ants and colony b's are in sensing range now (asked only of awake pairs) */
  contact: (a: number, b: number) => boolean;
  /**
   * This colony has died out for good (`Colony.extinct`, ja-ko75): it counts as asleep, so it never takes a place under the cap, it is frozen
   * the second it is found dead, and nothing wakes it. Absent: no colony is dead.
   */
  dead?: readonly boolean[];
}

export interface SleepVerdict {
  freeze: number[];
  thaw: number[];
}

export interface SleepState {
  lastNear: number[];
  touched: number[];
  /** null: not held by the cap (-Infinity, which JSON cannot carry) */
  capUntil: (number | null)[];
  nearBefore: boolean[];
  contacts: [number, number, number][];
  over: number;
}

export class SleepRule {
  readonly params: SleepParams;
  #lastNear: number[] = [];
  /** the last time the fungus touched colony k: a host entered its nest ground, or the fungus came within W of its hole (the moment it came) */
  #touched: number[] = [];
  /** until when the cap keeps colony k asleep */
  #capUntil: number[] = [];
  #nearBefore: boolean[] = [];
  /** the last time a pair were in contact, by "a,b" with a < b */
  #contacts = new Map<string, number>();
  /** how many decisions found the awake colonies over the cap with no group left to freeze (one group larger than it) */
  over = 0;

  constructor(colonies: number, params: Partial<SleepParams> = {}, now = 0) {
    this.params = { ...DEFAULT_SLEEP, ...params };
    for (let k = 0; k < colonies; k++) this.addColony(now);
  }

  /** A colony founded mid-game: awake, and touched now (it was just made where the fungus was, or it would not have been). */
  addColony(now: number): void {
    this.#lastNear.push(now);
    this.#touched.push(now);
    this.#capUntil.push(-Infinity);
    this.#nearBefore.push(false);
  }

  /** The groups: colonies in contact within the last T, with those linked through others, as lists of indices. */
  #groups(n: number, time: number, dead: (k: number) => boolean): number[][] {
    const root = Array.from({ length: n }, (_, k) => k);
    const find = (k: number): number => (root[k] === k ? k : (root[k] = find(root[k]!)));
    for (const [key, at] of this.#contacts) {
      if (time - at >= this.params.delay) continue;
      const [a, b] = key.split(",").map(Number) as [number, number];
      // an extinct colony is nobody's group-mate: its old contacts must not hold a living colony to it
      if (a < n && b < n && !dead(a) && !dead(b)) root[find(a)] = find(b);
    }
    const out = new Map<number, number[]>();
    for (let k = 0; k < n; k++) out.set(find(k), [...(out.get(find(k)) ?? []), k]);
    return [...out.values()];
  }

  /** What to do this second: the colonies to freeze and to thaw (disjoint). */
  step(inp: SleepInputs): SleepVerdict {
    const n = inp.asleep.length;
    const { time } = inp;
    const p = this.params;
    // Facts: the fungus's nearness, its touches, the contacts of the awake.
    for (let k = 0; k < n; k++) {
      if (inp.near[k]) {
        this.#lastNear[k] = time;
        if (!this.#nearBefore[k]) this.#touched[k] = time; // it came
      }
      if (inp.entered[k]) {
        this.#lastNear[k] = time;
        this.#touched[k] = time;
      }
      this.#nearBefore[k] = !!inp.near[k];
    }
    // A group asleep stays a group (it freezes and wakes together): entries between sleeping members stay fresh; the others expire after T.
    for (const [key, at] of this.#contacts) {
      const [a, b] = key.split(",").map(Number) as [number, number];
      // refresh before expiring: a group that froze with its entry T-1 old must not split on the next decision
      if (inp.asleep[a] && inp.asleep[b]) this.#contacts.set(key, time);
      else if (time - at >= p.delay) this.#contacts.delete(key);
    }
    for (let a = 0; a < n; a++)
      for (let b = a + 1; b < n; b++) if (!inp.asleep[a] && !inp.asleep[b] && inp.contact(a, b)) this.#contacts.set(`${a},${b}`, time);
    const dead = (k: number): boolean => !!inp.dead?.[k];
    const groups = this.#groups(n, time, dead);
    // An extinct colony is asleep for everything below: it does not count toward the cap and is not woken (the verdict freezes it if it was awake).
    const asleep = inp.asleep.map((s, k) => s || dead(k));
    const rank = (g: number[]) => Math.max(...g.map((k) => this.#touched[k]!));
    const awakeCount = () => asleep.filter((s) => !s).length;

    const wake = (g: number[]): void => {
      for (const k of g) {
        asleep[k] = false;
      }
    };
    const sleep = (g: number[], capUntil?: number): void => {
      for (const k of g) {
        asleep[k] = true;
        if (capUntil !== undefined) this.#capUntil[k] = capUntil;
      }
    };

    // 1. Wake: a sleeping group the awake fungus is near, or whose nest ground an awake host entered, unless the cap holds it asleep.
    for (const g of groups) {
      if (!g.every((k) => asleep[k])) continue;
      if (g.some(dead)) continue;
      if (g.some((k) => time < this.#capUntil[k]!)) continue;
      if (g.some((k) => inp.near[k] || inp.entered[k])) {
        // a wake is a touch: the group just woken outranks those awake the longer, so over the cap the awake set rotates
        // and it is no longer cap-frozen: a later ordinary freeze must not look like one
        for (const k of g) {
          this.#touched[k] = time;
          this.#capUntil[k] = -Infinity;
        }
        wake(g);
      }
    }
    // 2. Freeze: an awake group no member of which has had the fungus within W (or a host in its nest ground) for T.
    for (const g of groups) {
      if (g.some((k) => asleep[k])) continue;
      if (g.every((k) => time - this.#lastNear[k]! >= p.delay)) sleep(g);
    }
    // 3. The cap: over it, the lowest-ranked awake groups freeze whole and may not wake for T. The last group stays whatever its size.
    const awakeGroups = () => groups.filter((g) => g.every((k) => !asleep[k]));
    for (;;) {
      if (awakeCount() <= p.cap) break;
      const live = awakeGroups().sort((x, y) => rank(x) - rank(y) || x[0]! - y[0]!);
      if (live.length < 2) {
        this.over++;
        break;
      }
      sleep(live[0]!, time + p.delay);
    }
    // 4. Room comes back: the highest-ranked cap-frozen group that still holds the fungus wakes once its T has passed and there is room for it.
    const capFrozen = groups
      .filter((g) => g.every((k) => asleep[k] && this.#capUntil[k]! > -Infinity && time >= this.#capUntil[k]!))
      .filter((g) => g.some((k) => inp.holds[k]) && !g.some(dead))
      .sort((x, y) => rank(y) - rank(x) || x[0]! - y[0]!);
    for (const g of capFrozen) {
      if (awakeCount() + g.length > p.cap) continue;
      // it wakes on the strength of holding the fungus, so it stays awake for T on that
      for (const k of g) {
        this.#capUntil[k] = -Infinity;
        this.#lastNear[k] = time;
      }
      wake(g);
      break;
    }
    // The verdict is the difference from what the game said: a colony only freezes if it was awake and thaws if it was asleep.
    const freeze: number[] = [];
    const thaw: number[] = [];
    for (let k = 0; k < n; k++) {
      if (asleep[k] && !inp.asleep[k]) freeze.push(k);
      else if (!asleep[k] && inp.asleep[k]) thaw.push(k);
    }
    return { freeze, thaw };
  }

  /** The rule's memory, for a save. */
  saveState(): SleepState {
    return {
      lastNear: [...this.#lastNear],
      touched: [...this.#touched],
      capUntil: this.#capUntil.map((v) => (v === -Infinity ? null : v)),
      nearBefore: [...this.#nearBefore],
      contacts: [...this.#contacts].map(
        ([key, at]) => [...(key.split(",").map(Number) as [number, number]), at] as [number, number, number],
      ),
      over: this.over,
    };
  }

  loadState(s: SleepState): void {
    this.#lastNear = [...s.lastNear];
    this.#touched = [...s.touched];
    this.#capUntil = s.capUntil.map((v) => (v === null ? -Infinity : v));
    this.#nearBefore = [...s.nearBefore];
    this.#contacts = new Map(s.contacts.map(([a, b, at]) => [`${a},${b}`, at]));
    this.over = s.over;
  }
}
