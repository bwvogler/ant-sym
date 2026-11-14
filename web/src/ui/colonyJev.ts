import {
  errorOf,
  GAME_CAPS,
  hasAnswers,
  isProxyReply,
  isRunSummary,
  runOf,
  type JevAnswer,
  type JevProxyReply,
  type JevRequest,
  type RunCaps,
  type RunSummary,
} from "../../shared/jev.ts";
import { apiHeaders, apiUrl } from "./backend.ts";
export type { LaneName } from "../colony/index.ts";
import {
  LANE_KINDS,
  LANES,
  laneOfContext,
  type LaneSpec,
  type LaneName,
  localPolicy,
  localStance,
  type Colony,
  type Mode,
  type Policy,
  type Situation,
  type Stance,
  type StancePolicy,
  type StanceSituation,
  GENERIC_ANT,
  type LaneWords,
  type Species,
  localFungusRule,
  type FungalSituation,
  type FungusPolicy,
  decodeFungal,
  askedIn,
  FUNGUS_BATCH,
  FUNGUS_GATHER_MS,
  fungalKey,
  fungusContext,
  packFungusRequest,
  readLevels,
  validLevels,
  worthAsking,
  askedLevers,
  DEFAULT_MENU,
  type Fungus,
  type GrowthAnswer,
  type GrowthSituation,
  type Journal,
  PolicyCache,
} from "../colony/index.ts";

// The colonies' Jev client: the counterpart of JevScheduler for the colony
// game. The player is the fungus, so no colony is the player's: Jev, when on,
// drives every colony's ants and strategist under that colony's own doctrine
// (its nature, a scenario setting), and the fungus under the player's aim.
// Each kind of question is a lane: an ant's mode (per situation) and a
// colony's stance (per coarse view), one pair per colony, and the fungus's own
// (fungusBrain.ts). Caches and in-flight questions are kept by context (lane
// kind + words), across colonies: situations do not depend on the colony or
// the map, so two colonies with the same doctrine share every answer, and a
// question in flight for one is not asked again for the other. Every policy
// is synchronous: a cached answer if there is one, otherwise the local rule
// for now while the question is queued. Every interval the queues go to Jev,
// at most `batch` situations a request; same proxy, same ledger, same caps:
// a 409 ends the run and everyone carries on locally.

export interface ColonyJevOptions {
  batch: number;
  inFlight: number;
  intervalMs: number;
  /** milliseconds a gathering lane (the fungus's) lets its queue fill before sending a part-full request */
  gatherMs: number;
  /** milliseconds after a reply before the answers are written to the store (one write for the replies in between); 0 writes at once */
  saveMs: number;
}

export const DEFAULT_COLONY_JEV: ColonyJevOptions = { batch: 100, inFlight: 2, intervalMs: 300, gatherMs: FUNGUS_GATHER_MS, saveMs: 1000 };

/**
 * The caps a game's run starts with: none that bind (GAME_CAPS). A run stays open from the first miss until the page
 * closes, and the server's overall daily budget is the ceiling on spend (PR #42 review S8).
 */
export const COLONY_CAPS: RunCaps = GAME_CAPS;

/** Where cached answers outlive the page; injectable so tests need no localStorage. */
export interface CacheStore {
  load(context: string): [string, string][];
  save(context: string, entries: [string, string][]): void;
}

export interface ColonyJevState {
  phase: "off" | "running" | "stopped";
  run: RunSummary | null;
  /** this run: situations sent to Jev (ant modes and stances, every colony), requests sent */
  asked: number;
  stancesAsked: number;
  requests: number;
  /** this run: mode choices answered from the cache, and by the local rule while a situation was unanswered */
  hits: number;
  misses: number;
  /** answers cached under every colony's doctrine (modes, stances): a doctrine two colonies share counts once */
  cached: number;
  stancesCached: number;
  /** whether the colonies driven have a stance lane at all (a species may not: Species.lanes, ja-fnd.5.12): the panel says so rather than "0 stances" */
  stanceLane: boolean;
  /** mode answers cached for each colony's doctrine */
  doctrineCached: number[];
  /** this run: fungal situations sent to Jev; answers cached for the current aim (under every menu asked) */
  fungusAsked: number;
  fungusCached: number;
  /** this run: hyphal tips' situations sent to Jev; answers cached for the current aim (the growth lane, ja-2bw.5) */
  growthAsked: number;
  growthCached: number;
  failures: number;
  lastError: string | null;
}

type Listener = (s: ColonyJevState) => void;

/** One stream of questions: how to key, pack and read them, the local fallback, and the words they are asked under. */
interface Lane<S, A extends string> {
  name: LaneName;
  key: (s: S) => string;
  pack: (items: { id: string; key: string; situation: S }[], words: string) => JevRequest;
  /** the answer to item `id`, asked under `key`, or null when it is not one the question allowed */
  read: (answers: Record<string, JevAnswer>, id: string, situation: S, key: string) => A | null;
  local: (s: S) => A;
  /**
   * Whether a stored answer is one this lane's question could have given for `key`. Answers loaded from storage are
   * checked with it (ja-ue6): any string used to be accepted, and a bad one became a permanent hit.
   */
  valid: (key: string, answer: string) => boolean;
  /** whether a situation is worth asking at all (absent: always); one that is not gets the local rule, free */
  asks?: (s: S) => boolean;
  /** at most this many situations to a request (absent: the client's batch) */
  batch?: number;
  /**
   * Whether the lane lets its queue fill for opts.gatherMs before it sends less than a full batch (absent: send every
   * cycle). The fungus's legend is most of a small request, and its hosts play the local rule meanwhile (ja-lo8.4, ja-lo8.15).
   */
  gather?: boolean;
  /** when the queue last went from empty to not (Date.now()), for `gather` */
  since?: number;
  contextOf: (words: string) => string;
  /** the words its requests carry: a colony's doctrine, or the fungus's aim */
  words: string;
  context: string;
  /**
   * The contexts this lane asked under before, newest first (at most FALLBACKS): while the current words have no
   * answer for a situation and Jev can't answer (canAsk false), the newest earlier answer acts, marked stale (ja-lo8.3);
   * while it can, the local rule acts until the answer arrives (owner, 2026-11-08, ja-lo8.15).
   */
  fallback: string[];
  queue: Map<string, S>;
}

/** The growth lane's `local` while a situation has no answer: not an answer (validGrowth rejects it), so the tip plays its own rule. */
const NO_ANSWER = "";

/** How many earlier contexts a lane falls back on. */
export const FALLBACKS = 3;

/** Who decided: Jev's answer under the current words; an earlier answer while Jev can't answer (stale); the local rule while it is asked; the local rule. */
export type DecidedBy = "jev" | "stale" | "waiting" | "local";

/** In-flight questions are per context: a situation asked under one doctrine is still unasked under another. */
function askKey(context: string, key: string): string {
  return `${context}\u0000${key}`;
}

function lane<S, A extends string>(
  spec: Pick<Lane<S, A>, "name" | "key" | "pack" | "read" | "local" | "valid" | "contextOf" | "words" | "asks" | "batch" | "gather">,
): Lane<S, A> {
  return { ...spec, context: spec.contextOf(spec.words), fallback: [], queue: new Map() };
}

/** A colony this client drives: its lanes, null for a lane its species does not have (Species.lanes): nothing is asked or counted there. */
interface Driven {
  colony: Colony;
  modes: Lane<Situation, Mode> | null;
  stances: Lane<StanceSituation, Stance> | null;
}

/**
 * A runtime lane for an ant's row of the lane registry (colony/lanes.ts), asking under `words` (the doctrine) in the species' lane words
 * `lw` (legend, criteria, version: Species.lanes, ja-fnd.5.8): the row's functions with `lw` bound, so its context, question and the
 * answers it accepts are the species'. The generic ant's words are the rows' defaults, so its contexts and requests are unchanged.
 */
function antLane<Sit, Ans extends string>(
  row: Pick<LaneSpec<Sit, Ans, undefined>, "name" | "key" | "pack" | "read" | "valid" | "contextOf"> & { local: (s: Sit) => Ans },
  words: string,
  lw: LaneWords<Ans>,
  local: (s: Sit) => Ans = row.local,
): Lane<Sit, Ans> {
  return lane<Sit, Ans>({
    name: row.name,
    key: (s) => row.key(s, undefined, lw),
    pack: (items, w) => row.pack(items, w, lw),
    read: (a, id, s, key) => row.read(a, id, s, key, lw),
    local,
    valid: (key, a) => row.valid(key, a, lw),
    contextOf: (w) => row.contextOf(w, undefined, lw),
    words,
  });
}

/** A colony's lanes, asking under `words` (its doctrine) in its species' lane words; a lane the species lacks is null. */
function colonyLanes(words: string, species: Species): Omit<Driven, "colony"> {
  const { mode, stance } = species.lanes;
  return {
    // the stand-in while a situation is unanswered is the species' own local rule (ja-fnd.5.9)
    modes: mode ? antLane(LANES.mode, words, mode, species.policy ?? LANES.mode.local) : null,
    stances: stance ? antLane(LANES.stance, words, stance) : null,
  };
}

export class ColonyJev {
  opts: ColonyJevOptions;
  /** the page's game journal (?log=, ui/journal.ts): each batch asked, answered or failed is a "jev" event */
  journal: Journal | null = null;
  #driven: Driven[] = [];
  /** the species of the colonies driven (one per game: GameParams.species), whose lane words the colony lanes ask in */
  #species: Species = GENERIC_ANT;
  /** each colony's doctrine, by index (kept across games: a new world keeps the colonies' natures) */
  #doctrines: string[] = [];
  #store: CacheStore | null;
  #fungus: Fungus | null = null;
  /** the menu the fungus lane asks under: a copy of the attached fungus's (one source, ja-d87), or before one, every non-lethal lever */
  #menu: Set<string> = new Set(DEFAULT_MENU);
  /** the fungus's menuSeq when #menu was copied from it */
  #menuSeq = -1;
  // The levers asked (the menu's, in table order) are in each key, so a question is packed and its answer read and
  // kept against the levers it asked, whatever the menu is by the time it lands.
  #fungal = lane<FungalSituation, string>({
    name: "fungus",
    key: (s) => fungalKey(s, this.#asked(s)),
    pack: (items, aim) =>
      packFungusRequest(
        items.map((it) => ({ ...it, asked: askedIn(it.key) })),
        aim,
      ),
    read: (a, id, _s, key) => readLevels(a, id, askedIn(key)),
    valid: validLevels,
    local: (s) => (this.#fungus ? this.#fungus.local(s) : localFungusRule()(s)),
    asks: (s) => worthAsking(this.#asked(s)),
    contextOf: (aim) => fungusContext(aim, this.#fungus?.hasNest ? "side" : "top"),
    words: "",
    batch: FUNGUS_BATCH,
    gather: true,
  });
  // The growth lane (ja-2bw.5), under the fungus's aim. While a situation has no answer its `local` is NO_ANSWER: the tip then plays its
  // own local rule (hyphae.ts localGrowth), which reads its body as well as its situation.
  #growth = lane<GrowthSituation, string>({
    name: "growth",
    key: (s) => LANES.growth.key(s, undefined),
    pack: (items, aim) => LANES.growth.pack(items, aim),
    read: (a, id, s, key) => LANES.growth.read(a, id, s, key),
    valid: LANES.growth.valid,
    local: () => NO_ANSWER,
    contextOf: (aim) => LANES.growth.contextOf(aim),
    words: "",
    batch: LANES.growth.batch ?? undefined,
    gather: true,
  });
  /** The levers the fungus lane asks for a host in situation s: the menu's, a queen's or a worker's, in table order. */
  #asked(s?: FungalSituation): string[] {
    this.#followMenu();
    return askedLevers(this.#menu, s?.task === "queen");
  }
  /**
   * Copy the fungus's menu if it changed since (whoever set it: setMenu, Fungus.configure, a load). Queued questions were
   * keyed under the old menu: dropped, the hosts ask again. Questions in flight are read against the levers they asked.
   */
  #followMenu(): void {
    const f = this.#fungus;
    if (!f || f.menuSeq === this.#menuSeq) return;
    this.#menuSeq = f.menuSeq;
    this.#menu = f.menu; // the fungus drops what its map can't run (NEST_ONLY on top-down maps)
    this.#fungal.queue.clear();
  }
  /** caches by context, shared by every lane asking under it */
  #caches = new Map<string, PolicyCache<string>>();
  /** questions in flight, by askKey(context, key), across lanes */
  #asking = new Set<string>();
  #inFlight = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #aborter = new AbortController();
  /** caches with answers not yet written to the store, by context */
  #unsaved = new Map<string, PolicyCache<string>>();
  #saveTimer: ReturnType<typeof setTimeout> | null = null;
  #runSeq = 0;
  /** cycles to sit out after a failed call, so a broken upstream is not hammered */
  #cooldown = 0;
  /**
   * Bumped by dispose and Stop. A Start reply that lands after either must not open a run (ja-7tf). A counter, not a
   * latch: React's StrictMode disposes the client once on mount and keeps using it, so Start must work after a dispose.
   */
  #life = 0;
  /** Bumped by every start(): a late Start reply closes its run only if no later Start has begun (that run is the server's current one). */
  #starts = 0;
  /** where the next cycle starts in the lanes, so no lane waits behind the others' long queues (ja-ytc) */
  #nextLane = 0;
  #listeners = new Set<Listener>();
  #state: ColonyJevState = {
    phase: "off",
    run: null,
    asked: 0,
    stancesAsked: 0,
    requests: 0,
    hits: 0,
    misses: 0,
    cached: 0,
    stancesCached: 0,
    stanceLane: true,
    doctrineCached: [],
    fungusAsked: 0,
    fungusCached: 0,
    growthAsked: 0,
    growthCached: 0,
    failures: 0,
    lastError: null,
  };

  /**
   * Called when a situation has no answer under the current words and no run is on (S7): the page starts one if Jev
   * can run (policyLock.shouldStart). Called on every such miss, so it must be cheap.
   */
  wantsRun: (() => void) | null = null;

  /** Whether Jev can answer new words now (see canAsk). */
  #canAsk = true;

  /**
   * Whether Jev can answer new words now (the page sets it from policyLock: true when there is no lock). While it can, a
   * situation with no answer under the words in force plays the local rule until Jev's answer arrives. Answers under
   * earlier words play only while it can't (no server or key, the budget spent, Stop, a failed start). Owner,
   * 2026-11-08, ja-lo8.15. A change makes every ant reconsider at once.
   */
  get canAsk(): boolean {
    return this.#canAsk;
  }

  set canAsk(v: boolean) {
    if (v === this.#canAsk) return;
    this.#canAsk = v;
    this.#reconsider();
  }

  constructor(opts: Partial<ColonyJevOptions> = {}, store: CacheStore | null = null) {
    this.opts = { ...DEFAULT_COLONY_JEV, ...opts };
    this.#store = store;
  }

  get state(): ColonyJevState {
    return this.#state;
  }

  /** The first colony's doctrine. */
  get doctrine(): string {
    return this.#doctrines[0] ?? "";
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  #set(patch: Partial<ColonyJevState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const fn of this.#listeners) fn(this.#state);
  }

  #cache<S, A extends string>(l: Lane<S, A>, context = l.context): PolicyCache<A> {
    let c = this.#caches.get(context);
    if (!c) {
      // Stored answers are kept only if this lane's question could have given them.
      c = new PolicyCache<string>(
        context,
        (this.#store?.load(context) ?? []).filter(([key, a]) => l.valid(key, a)),
      );
      this.#caches.set(context, c);
    }
    return c as unknown as PolicyCache<A>;
  }

  /** The cache sizes the panel shows. */
  #counts(): Pick<ColonyJevState, "cached" | "stancesCached" | "stanceLane" | "doctrineCached" | "fungusCached" | "growthCached"> {
    // Every colony's, not the first's (PRD §65): one cache per context, so colonies of one doctrine count once.
    const modes = new Map<string, number>();
    const stances = new Map<string, number>();
    for (const d of this.#driven) {
      if (d.modes) modes.set(d.modes.context, this.#cache(d.modes).size);
      if (d.stances) stances.set(d.stances.context, this.#cache(d.stances).size);
    }
    const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);
    return {
      cached: sum(modes),
      stancesCached: sum(stances),
      stanceLane: this.#species.lanes.stance !== undefined,
      doctrineCached: this.#driven.map((d) => (d.modes ? this.#cache(d.modes).size : 0)),
      fungusCached: this.#cache(this.#fungal).size,
      growthCached: this.#cache(this.#growth).size,
    };
  }

  /** The newest earlier answer for `key` in lane l (its fallback contexts), or null. */
  #earlier<S, A extends string>(l: Lane<S, A>, key: string): A | null {
    for (const c of l.fallback) {
      const a = this.#cache(l, c).get(key);
      if (a) return a;
    }
    return null;
  }

  /**
   * The answer for situation s in lane l: Jev's cached answer whenever there is one, run or no run (the fungus game,
   * ja-lo8.2: the game plays on what Jev already answered); else the local rule while Jev is asked (ja-lo8.15), or, while
   * Jev can't answer (canAsk false), an earlier answer under words this lane had before (stale, ja-lo8.3). While a run is on, a situation with
   * no current answer is queued to be asked, under any words, preset or the player's own; while none is, the miss is
   * told to `wantsRun`, which may start one (PR #42 review S7: spend nothing while every situation met is cached).
   */
  #lookup<S, A extends string>(l: Lane<S, A>, s: S): A {
    if (l.asks && !l.asks(s)) return l.local(s);
    const key = l.key(s);
    const hit = this.#cache(l).get(key);
    const running = this.#state.phase === "running";
    if (running && LANE_KINDS[l.name].countsHits) {
      if (hit) this.#state.hits++;
      else this.#state.misses++;
    }
    if (hit) return hit;
    if (!running) this.wantsRun?.();
    if (running && this.#unasked(l, key)) {
      if (l.queue.size === 0) l.since = Date.now();
      l.queue.set(key, s);
    }
    return (this.#canAsk ? null : this.#earlier(l, key)) ?? l.local(s);
  }

  /** Whether situation `key` of lane l still needs asking under its words: not cached, not in flight, not queued. */
  #unasked<S, A extends string>(l: Lane<S, A>, key: string): boolean {
    return !this.#cache(l).get(key) && !this.#asking.has(askKey(l.context, key)) && !l.queue.has(key);
  }

  /**
   * What a player's new aim would have Jev asked now (ja-lo8.21): every situation the fungus's hosts are in this step (each
   * ant's last fungal situation, Colony.fungal, which Fungus writes as it chooses), and every growth situation, each only
   * if it still needs asking (#unasked: cached ones, the shipped answers of a preset aim among them, are not). A queen's
   * situation is not kept per ant: hers is asked at the next step, as any miss is.
   */
  #aimQuestions(): { l: Lane<unknown, string>; key: string; s: unknown }[] {
    const out: { l: Lane<unknown, string>; key: string; s: unknown }[] = [];
    const add = <S>(l: Lane<S, string>, s: S) => {
      if (l.asks && !l.asks(s)) return;
      const key = l.key(s);
      if (this.#unasked(l, key) && !out.some((q) => q.l === l && q.key === key)) out.push({ l: l as Lane<unknown, string>, key, s });
    };
    const seen = new Set<number>();
    for (const d of this.#driven) {
      const c = d.colony;
      for (let i = 0; i < c.n; i++) {
        const code = c.fungal[i]!;
        if (!c.alive[i] || code < 0 || seen.has(code)) continue;
        seen.add(code);
        add(this.#fungal, decodeFungal(code));
      }
    }
    for (const s of LANES.growth.all()) add(this.#growth, s);
    return out;
  }

  /** Queue a new aim's questions (#aimQuestions) and let them go at the next cycle, without the gather wait. */
  #queueAim(): void {
    for (const { l, key, s } of this.#aimQuestions()) l.queue.set(key, s);
    for (const l of [this.#fungal, this.#growth]) if (l.queue.size > 0) l.since = 0;
  }

  /** Who decides, in lane l, situation s right now (DecidedBy). Counts and queues nothing. */
  #explain<S, A extends string>(l: Lane<S, A>, s: S): { answer: A; by: DecidedBy } {
    const local = l.local(s);
    if (l.asks && !l.asks(s)) return { answer: local, by: "local" };
    const key = l.key(s);
    const hit = this.#cache(l).get(key);
    if (hit) return { answer: hit, by: "jev" };
    const earlier = this.#canAsk ? null : this.#earlier(l, key);
    if (earlier) return { answer: earlier, by: "stale" };
    if (this.#state.phase !== "running") return { answer: local, by: "local" };
    return { answer: local, by: l.queue.has(key) || this.#asking.has(askKey(l.context, key)) ? "waiting" : "local" };
  }

  /** Who decides an ant of colony k in situation `s` right now (the follow card). */
  explain(s: Situation, k = 0): { mode: Mode; by: DecidedBy } {
    const d = this.#driven[k];
    if (!d?.modes) return { mode: (this.#species.policy ?? localPolicy)(s), by: "local" };
    const e = this.#explain(d.modes, s);
    return { mode: e.answer, by: e.by };
  }

  /** The first colony's ants' policy (kept for a single colony; each attached colony is given its own). */
  readonly policy: Policy = (s) => {
    const d = this.#driven[0];
    return d?.modes ? this.#lookup(d.modes, s) : (this.#species.policy ?? localPolicy)(s);
  };
  /** The first colony's strategist's policy, the same way. */
  readonly stancePolicy: StancePolicy = (s) => {
    const d = this.#driven[0];
    return d?.stances ? this.#lookup(d.stances, s) : localStance(s);
  };

  /** The fungus's policy, the same way, on its own lane: what the fungus does to a host in this fungal situation. */
  readonly fungusPolicy: FungusPolicy = (s) => this.#lookup(this.#fungal, s);

  /**
   * The fungus's growth policy (ja-2bw.5): what a hyphal tip in situation `s` does, Jev's cached answer under the aim, or
   * null while there is none (the tip plays its own local rule; the miss is queued as any other lane's).
   */
  readonly growthPolicy = (s: GrowthSituation): GrowthAnswer | null => {
    const a = this.#lookup(this.#growth, s);
    return a === NO_ANSWER ? null : (a as GrowthAnswer);
  };

  /** Who decides what the fungus does in situation `s` right now (the follow card). */
  explainFungus(s: FungalSituation): { answer: string; by: DecidedBy } {
    return this.#explain(this.#fungal, s);
  }

  /**
   * The fungus's answers so far, for the Learn drawer's table (ja-lo8.4): each situation answered under the current aim
   * with the levers asked now, and, while Jev can't answer (canAsk false: they are what plays), where it has none yet, the
   * newest earlier aim's answer, marked stale. Read only.
   */
  fungusAnswers(): { key: string; answer: string; stale: boolean }[] {
    const l = this.#fungal;
    // A key asked the levers the menu has on now, for its kind of host (a queen's key names the queen's).
    const current = (key: string) => askedIn(key).join(",") === this.#asked({ task: key.split("|")[3] } as FungalSituation).join(",");
    const out = new Map<string, { key: string; answer: string; stale: boolean }>();
    for (const [key, answer] of this.#cache(l).entries()) if (current(key)) out.set(key, { key, answer, stale: false });
    if (!this.#canAsk)
      for (const c of l.fallback)
        for (const [key, answer] of this.#cache(l, c).entries())
          if (!out.has(key) && current(key)) out.set(key, { key, answer, stale: true });
    return [...out.values()];
  }

  /** Drive the game's fungus: its policy becomes this lane (Jev's cached answer while a run is on, else the fungus's local rule). */
  attachFungus(fungus: Fungus): void {
    this.#fungus = fungus;
    fungus.bindPolicy("fungus", this.fungusPolicy);
    fungus.bindPolicy("growth", this.growthPolicy);
    this.#menuSeq = -1;
    this.#followMenu();
    this.#recontext(this.#fungal, this.#fungal.words); // the view is part of the fungus's context (fungusContext)
  }

  /**
   * The fungus's aim: its own caches (free if used before). `askNow` (a player's change, ja-lo8.21, owner 2026-11-14): Jev
   * is asked at once, in one go, what the new aim has no answer for among the situations the hosts are in and every
   * growth situation, instead of host by host as each meets it; with no run on, a run is wanted and they go when it
   * starts. Without it (the first aim, a save's coming back) they are asked as they come up.
   */
  setAim(text: string, opts: { askNow?: boolean } = {}): void {
    const a = this.#recontext(this.#fungal, text);
    const b = this.#recontext(this.#growth, text); // the growth lane asks under the same aim
    if (!opts.askNow || !(a || b)) return;
    if (this.#state.phase === "running") this.#queueAim();
    else if (this.#aimQuestions().length > 0) {
      this.#askOnStart = true;
      this.wantsRun?.();
    }
  }

  /** A player's new aim is waiting for a run to start before its questions go (setAim's askNow). */
  #askOnStart = false;

  /**
   * The player's menu: the levers the fungus may pull, set on the attached fungus (the one source: Fungus.configure
   * changes it as well). Which levers are asked is part of every question, so it is in the key: answers under a menu
   * used before still hold.
   */
  setMenu(menu: Set<string>): void {
    if (this.#fungus) {
      this.#fungus.menu = menu;
      this.#followMenu();
    } else {
      this.#menu = new Set(menu);
      this.#fungal.queue.clear();
    }
  }

  /**
   * New words for a lane: its own cache (free if used before), and a fresh queue. The words it had become its newest
   * fallback, played only while Jev can't answer (canAsk). Returns whether the context changed.
   */
  #recontext<S, A extends string>(l: Lane<S, A>, words: string): boolean {
    l.words = words;
    const context = l.contextOf(words);
    if (context === l.context) return false;
    const before = l.context;
    l.fallback = [before, ...l.fallback.filter((c) => c !== before)].filter((c) => c !== context).slice(0, FALLBACKS);
    l.context = context;
    l.queue.clear();
    this.#set(this.#counts());
    return true;
  }

  /**
   * Answers shipped with the page (ui/precache.ts) for a context: kept where nothing for that situation is cached yet,
   * so answers this browser got from Jev win. Only answers this lane's question could give are kept (`valid`). The
   * colonies reconsider, so shipped answers take hold at once.
   */
  seed(context: string, entries: readonly [string, string][], species: Species = GENERIC_ANT): number {
    // Checked against the bundle's own species' words, not the game's (ja-fnd.5.15): a page that seeds while playing one species keeps
    // every other species' answers for a later game.
    const l = this.#laneFor(context, species);
    if (!l) return 0;
    const cache = this.#cache(l, context);
    let added = 0;
    for (const [key, a] of entries)
      if (!cache.get(key) && l.valid(key, a)) {
        cache.put(key, a);
        added++;
      }
    if (added) {
      this.#set(this.#counts());
      this.#reconsider();
    }
    return added;
  }

  /** A lane whose kind of context this is (by its prefix: colony-, stance-, fungus-), to check answers against. */
  #laneFor(context: string, species: Species): Lane<unknown, string> | null {
    const kind = laneOfContext(context);
    if (kind === "fungus") return this.#fungal as Lane<unknown, string>;
    if (kind === "growth") return this.#growth as Lane<unknown, string>;
    const d = colonyLanes("", species);
    return kind === "mode"
      ? (d.modes as Lane<unknown, string> | null)
      : kind === "stance"
        ? (d.stances as Lane<unknown, string> | null)
        : null;
  }

  /** Drive this one colony (kept for a single colony; see attachColonies). */
  attach(colony: Colony): void {
    this.attachColonies([colony]);
  }

  /**
   * Drive these colonies, each under its own doctrine (a new world is new colonies; the caches carry over:
   * situations depend on neither the colony nor the map). Each colony's policies become its own lanes.
   */
  attachColonies(colonies: readonly Colony[], species: Species = GENERIC_ANT): void {
    this.#species = species;
    this.#driven = colonies.map((colony, k) => {
      const words = this.#doctrines[k] ?? this.#doctrines[0] ?? "";
      const d: Driven = { colony, ...colonyLanes(words, species) };
      // A lane the species lacks is never asked: the colony keeps the policy the Game gave it (its local rule).
      const { modes, stances } = d;
      if (modes) colony.bindPolicy("mode", (s) => this.#lookup(modes, s));
      if (stances) colony.bindPolicy("stance", (s) => this.#lookup(stances, s));
      colony.reconsider();
      return d;
    });
    this.#set(this.#counts());
  }

  /** The first colony's doctrine (see setDoctrineFor). */
  setDoctrine(text: string): void {
    this.setDoctrineFor(0, text);
  }

  /**
   * A new doctrine for colony k: its own caches (free if used before, by either colony), and its ants reconsider under
   * it. A colony that has no doctrine of its own follows the first colony's, now as well as at the next game (ja-6yj).
   * Until the new words are answered, its ants play the local rule (the old words' answers only while Jev can't answer,
   * canAsk). A daughter colony (ja-lo8.9) is no different: her mother's answers never stand in for hers.
   */
  setDoctrineFor(k: number, text: string): void {
    this.#doctrines[k] = text;
    this.#driven.forEach((d, j) => {
      if (j !== k && !(k === 0 && this.#doctrines[j] === undefined)) return;
      const a = d.modes ? this.#recontext(d.modes, text) : false;
      const b = d.stances ? this.#recontext(d.stances, text) : false;
      if (a || b) d.colony.reconsider();
    });
  }

  async start(caps: Partial<RunCaps> = COLONY_CAPS): Promise<void> {
    const life = this.#life;
    const startNo = ++this.#starts;
    let run: RunSummary;
    try {
      const res = await fetch(apiUrl("api/run"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({ action: "start", caps: { ...COLONY_CAPS, ...caps } }),
      });
      const body: unknown = await res.json();
      if (!res.ok || !isRunSummary(body)) {
        this.#set({ lastError: errorOf(body) ?? `start failed (${res.status})` });
        return;
      }
      run = body;
    } catch (e) {
      this.#set({ lastError: `start failed: ${String(e)}` });
      return;
    }
    if (life !== this.#life || startNo !== this.#starts) {
      // Disposed or stopped while Start was on the wire: close the run it opened, start no timers (ja-7tf). The server's
      // stop ends whatever run is current, so if a later Start has begun, that run is the later one's: leave it alone.
      if (startNo !== this.#starts) return;
      void fetch(apiUrl("api/run"), { method: "POST", headers: apiHeaders(), body: JSON.stringify({ action: "stop" }) }).catch(() => {});
      return;
    }
    if (run.running === false) {
      // The server ended the run as it started: today's budget is spent (S8). Nothing is asked; the game plays on.
      this.#set({ phase: "stopped", run });
      return;
    }
    this.#runSeq++;
    this.#aborter.abort(); // a Start while running: the old run's calls end with it, and free their in-flight slots
    this.#aborter = new AbortController();
    this.#clearQueues();
    this.#cooldown = 0;
    this.#set({
      phase: "running",
      run,
      asked: 0,
      stancesAsked: 0,
      fungusAsked: 0,
      growthAsked: 0,
      requests: 0,
      hits: 0,
      misses: 0,
      failures: 0,
      lastError: null,
      ...this.#counts(),
    });
    if (this.#askOnStart) {
      this.#askOnStart = false;
      this.#queueAim();
    }
    this.#reconsider();
    if (this.#timer === null) this.#timer = setInterval(() => this.#cycle(), this.opts.intervalMs);
  }

  /** Write what the replies since the last write brought: one write a context, however many replies there were. */
  flushCache(): void {
    if (this.#saveTimer !== null) clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    for (const [context, cache] of this.#unsaved) this.#store?.save(context, cache.entries());
    this.#unsaved.clear();
  }

  #saveSoon(context: string, cache: PolicyCache<string>): void {
    if (this.opts.saveMs <= 0) {
      this.#store?.save(context, cache.entries());
      return;
    }
    if (!this.#store) return;
    this.#unsaved.set(context, cache);
    this.#saveTimer ??= setTimeout(() => this.flushCache(), this.opts.saveMs);
  }

  async stop(): Promise<void> {
    this.flushCache();
    this.#life++;
    this.#halt();
    this.#aborter.abort();
    // If Start is pressed again before this reply lands, the reply belongs to the old run: ignore it.
    const seq = this.#runSeq;
    try {
      const res = await fetch(apiUrl("api/run"), { method: "POST", headers: apiHeaders(), body: JSON.stringify({ action: "stop" }) });
      const body: unknown = await res.json();
      if (seq === this.#runSeq)
        this.#set(
          isRunSummary(body)
            ? { phase: "stopped", run: body }
            : { phase: "stopped", lastError: errorOf(body) ?? `stop answered ${res.status}` },
        );
    } catch (e) {
      if (seq === this.#runSeq) this.#set({ phase: "stopped", lastError: String(e) });
    }
  }

  dispose(): void {
    this.flushCache();
    this.#life++;
    this.#halt();
    this.#aborter.abort();
    this.#listeners.clear();
  }

  #reconsider(): void {
    for (const d of this.#driven) d.colony.reconsider();
  }

  #lanes(): Lane<unknown, string>[] {
    const out: Lane<unknown, string>[] = [];
    for (const d of this.#driven) {
      if (d.stances) out.push(d.stances as Lane<unknown, string>);
      if (d.modes) out.push(d.modes as Lane<unknown, string>);
    }
    out.push(this.#fungal as Lane<unknown, string>, this.#growth as Lane<unknown, string>);
    return out;
  }

  #clearQueues(): void {
    for (const l of this.#lanes()) l.queue.clear();
    this.#asking.clear();
  }

  #halt(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#clearQueues();
    this.#askOnStart = false;
    if (this.#state.phase === "running") this.#set({ phase: "stopped" });
    this.#reconsider(); // back to the local rule at once
  }

  #cycle(): void {
    if (this.#state.phase !== "running") return;
    this.#followMenu(); // a menu changed since the last lookup: drop the questions queued under the old one before sending
    if (this.#cooldown > 0) {
      this.#cooldown--;
      return;
    }
    // Never past the server's own limit (JEV_IN_FLIGHT): a call over it would only come back 429 busy.
    const width = Math.min(this.opts.inFlight, this.#state.run?.maxInFlight ?? this.opts.inFlight);
    // One batch per lane per pass, starting one lane further on each cycle: a lane with a long queue (the modes, early
    // in a game) no longer holds every slot while the fungus and the other colonies wait (ja-ytc).
    const lanes = this.#lanes();
    const first = this.#nextLane % lanes.length;
    for (let moved = true; moved && this.#inFlight < width;) {
      moved = false;
      for (let j = 0; j < lanes.length && this.#inFlight < width; j++) {
        const l = lanes[(first + j) % lanes.length] as Lane<unknown, string>;
        if (l.queue.size === 0) continue;
        if (l.gather && l.queue.size < (l.batch ?? this.opts.batch) && Date.now() - (l.since ?? 0) < this.opts.gatherMs) continue;
        moved = true; // every pass takes something out of a non-empty queue, so this ends
        const batch: [string, unknown][] = [];
        for (const [k, s] of l.queue) {
          if (batch.length >= (l.batch ?? this.opts.batch)) break;
          l.queue.delete(k);
          // Another colony's lane may be asking it under the same context already: one question, one answer for both.
          if (this.#asking.has(askKey(l.context, k))) continue;
          this.#asking.add(askKey(l.context, k));
          batch.push([k, s]);
        }
        if (batch.length) {
          // The next cycle starts after the lane just served. Moved only when a batch goes out: moved every cycle, a
          // request lasting a multiple of the lane count in cycles found the same lane first at every free slot.
          this.#nextLane = ((first + j) % lanes.length) + 1;
          void this.#ask(l, batch);
        }
      }
    }
  }

  async #ask<S, A extends string>(l: Lane<S, A>, batch: [string, S][]): Promise<void> {
    const seq = this.#runSeq;
    const context = l.context;
    const items = batch.map(([key, situation], n) => ({
      id: `${LANE_KINDS[l.name].idPrefix}${n}`,
      key,
      situation,
    }));
    const counted = LANE_KINDS[l.name].counter;
    this.#inFlight++;
    this.#set({ [counted]: this.#state[counted] + items.length, requests: this.#state.requests + 1 });
    this.journal?.note("jev", -1, `asked ${items.length} ${l.name} situation${items.length === 1 ? "" : "s"}`, {
      lane: l.name,
      keys: items.map((it) => it.key),
    });
    let reply: JevProxyReply | null = null;
    let error: string | null = null;
    try {
      const res = await fetch(apiUrl("api/jev"), {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify(l.pack(items, l.words)),
        signal: this.#aborter.signal,
      });
      const body: unknown = await res.json();
      if (res.status === 409) {
        const run = runOf(body);
        this.#halt();
        this.#aborter.abort(); // as Stop does: the run is over, so is everything still in flight in it
        this.#set({ phase: "stopped", run, lastError: `Jev stopped: ${errorOf(body) ?? "run over"}. Ants are on the local rule.` });
        return;
      }
      if (res.status === 429 && errorOf(body) === "busy") {
        // Ask again next cycle, under the context it was asked under, for what that context hasn't cached since. Into
        // every current lane asking under that context, not only the one that sent it: that lane may be gone (a new
        // game) or have moved to another doctrine, and other colonies' lanes skipped these while they were in flight (ja-1u2).
        if (seq === this.#runSeq)
          for (const m of this.#lanes())
            if (m.name === l.name && m.context === context)
              for (const it of items)
                if (m.key(it.situation) === it.key && !this.#cache(m, context).get(it.key)) m.queue.set(it.key, it.situation); // a fungus key built under an older menu is not asked again
        this.#set({ [counted]: this.#state[counted] - items.length, run: runOf(body) ?? this.#state.run });
        return;
      }
      if (!res.ok) error = errorOf(body) ?? `HTTP ${res.status}`;
      else if (isProxyReply(body)) reply = body;
      else error = "the server's reply was not a Jev reply";
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "AbortError") return; // Stop cut it
      error = String(err);
    } finally {
      this.#inFlight--;
      // A new run (Start) cleared the in-flight set and may be asking these again: theirs, not this run's, to clear.
      if (seq === this.#runSeq) for (const it of items) this.#asking.delete(askKey(context, it.key));
    }
    const answers = reply && reply.status === 200 && hasAnswers(reply.body) ? reply.body.answers : null;
    if (!reply || !answers) {
      // Not billed as a reply; everyone keeps the local rule and meets the situation again later.
      this.#cooldown = 5;
      this.journal?.note("jev", -1, `${l.name} batch failed: ${error ?? `jev answered ${reply?.status ?? "?"}`}`, { lane: l.name });
      this.#set({
        failures: this.#state.failures + 1,
        lastError: error ?? `jev answered ${reply?.status ?? "?"}`,
        run: runOf(reply) ?? this.#state.run,
      });
      return;
    }
    // A billed answer is kept under the context it was asked under, whichever run or doctrine is current now.
    const cache = this.#cache(l, context);
    const got: Record<string, string> = {};
    for (const it of items) {
      const a = l.read(answers, it.id, it.situation, it.key);
      if (a) cache.put(it.key, (got[it.key] = a));
    }
    this.journal?.note("jev", -1, `${l.name}: ${Object.keys(got).length} of ${items.length} answered`, { lane: l.name, answers: got });
    this.#saveSoon(context, cache as unknown as PolicyCache<string>);
    this.#set({ run: runOf(reply) ?? this.#state.run, lastError: null, ...this.#counts() });
    // The fungus asks its policy every step, so its new answers take hold by themselves; the ants reconsider.
    if (seq === this.#runSeq && LANE_KINDS[l.name].reconsiders) this.#reconsider();
  }
}
