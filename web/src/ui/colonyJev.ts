import type { JevAnswer, JevProxyReply, JevRequest, JevResponse, RunCaps, RunSummary } from "../../shared/jev.ts";
import { localPolicy, localStance, type Colony, type Mode, type Policy, type Situation, type Stance, type StancePolicy, type StanceSituation } from "../colony/colony.ts";
import { packModeRequest, packStanceRequest, policyContext, readMode, readStance, situationKey, stanceContext, stanceKey } from "../colony/colonyBrain.ts";
import { PolicyCache } from "../sim/policyCache.ts";

// The colony's Jev client: the counterpart of JevScheduler for the player's
// colony. Two choices go to Jev, each on its own lane with its own cache per
// doctrine: an ant's mode (per situation) and the colony's stance (per
// coarse view, from the strategist). The colony needs an answer at once, so
// both policies it is given are synchronous: a cached answer for this
// doctrine if there is one, otherwise the local rule for now while the
// situation is queued. Every interval the queues go to Jev, at most `batch`
// situations a request; each answer is cached and every ant reconsiders, so
// Jev's choice takes over within a tick. Same proxy, same ledger, same caps
// as the picture: a 409 ends the run and the colony carries on locally.

export interface ColonyJevOptions {
  batch: number;
  inFlight: number;
  intervalMs: number;
}

export const DEFAULT_COLONY_JEV: ColonyJevOptions = { batch: 100, inFlight: 2, intervalMs: 300 };

/** Colony runs are long and cheap: higher time cap, lower spend cap than a picture. */
export const COLONY_CAPS: RunCaps = { capUsd: 0.1, capSeconds: 1800 };

/** Where cached answers outlive the page; injectable so tests need no localStorage. */
export interface CacheStore {
  load(context: string): [string, string][];
  save(context: string, entries: [string, string][]): void;
}

export interface ColonyJevState {
  phase: "off" | "running" | "stopped";
  run: RunSummary | null;
  /** this run: situations sent to Jev (ant modes and stances), requests sent */
  asked: number;
  stancesAsked: number;
  requests: number;
  /** this run: mode choices answered from the cache, and by the local rule while a situation was unanswered */
  hits: number;
  misses: number;
  /** answers cached for the current doctrine */
  cached: number;
  stancesCached: number;
  failures: number;
  lastError: string | null;
}

type Listener = (s: ColonyJevState) => void;

/** One kind of question: how to key, pack and read it, the local fallback, and its caches per doctrine. */
interface Lane<S, A extends string> {
  name: "mode" | "stance";
  key: (s: S) => string;
  pack: (items: { id: string; situation: S }[], doctrine: string) => JevRequest;
  read: (answers: Record<string, JevAnswer>, id: string) => A | null;
  local: (s: S) => A;
  contextOf: (doctrine: string) => string;
  context: string;
  caches: Map<string, PolicyCache<A>>;
  queue: Map<string, S>;
  asking: Set<string>;
}

function lane<S, A extends string>(spec: Pick<Lane<S, A>, "name" | "key" | "pack" | "read" | "local" | "contextOf">): Lane<S, A> {
  return { ...spec, context: spec.contextOf(""), caches: new Map(), queue: new Map(), asking: new Set() };
}

export class ColonyJev {
  opts: ColonyJevOptions;
  #colony: Colony | null = null;
  #doctrine = "";
  #store: CacheStore | null;
  #modes = lane<Situation, Mode>({ name: "mode", key: situationKey, pack: packModeRequest, read: readMode, local: localPolicy, contextOf: policyContext });
  #stances = lane<StanceSituation, Stance>({ name: "stance", key: stanceKey, pack: packStanceRequest, read: readStance, local: localStance, contextOf: stanceContext });
  #inFlight = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #aborter = new AbortController();
  #runSeq = 0;
  /** cycles to sit out after a failed call, so a broken upstream is not hammered */
  #cooldown = 0;
  #listeners = new Set<Listener>();
  #state: ColonyJevState = { phase: "off", run: null, asked: 0, stancesAsked: 0, requests: 0, hits: 0, misses: 0, cached: 0, stancesCached: 0, failures: 0, lastError: null };

  constructor(opts: Partial<ColonyJevOptions> = {}, store: CacheStore | null = null) {
    this.opts = { ...DEFAULT_COLONY_JEV, ...opts };
    this.#store = store;
  }

  get state(): ColonyJevState {
    return this.#state;
  }

  get doctrine(): string {
    return this.#doctrine;
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
    let c = l.caches.get(context);
    if (!c) {
      c = new PolicyCache<A>(context, (this.#store?.load(context) ?? []) as [string, A][]);
      l.caches.set(context, c);
    }
    return c;
  }

  #lookup<S, A extends string>(l: Lane<S, A>, s: S): A {
    if (this.#state.phase !== "running") return l.local(s);
    const key = l.key(s);
    const hit = this.#cache(l).get(key);
    if (l === (this.#modes as unknown)) {
      if (hit) this.#state.hits++;
      else this.#state.misses++;
    }
    if (hit) return hit;
    if (!l.asking.has(key)) l.queue.set(key, s);
    return l.local(s);
  }

  /**
   * Who decides an ant in situation `s` right now, without counting a hit or queuing anything (the
   * follow card): Jev's cached answer, the local rule while the question waits for Jev, or the local rule.
   */
  explain(s: Situation): { mode: Mode; by: "jev" | "waiting" | "local" } {
    if (this.#state.phase !== "running") return { mode: localPolicy(s), by: "local" };
    const key = situationKey(s);
    const hit = this.#cache(this.#modes).get(key);
    if (hit) return { mode: hit, by: "jev" };
    return { mode: localPolicy(s), by: this.#modes.queue.has(key) || this.#modes.asking.has(key) ? "waiting" : "local" };
  }

  /** The ants' policy: Jev's cached answer while a run is on, else the local rule (queuing what Jev has not answered). */
  readonly policy: Policy = (s) => this.#lookup(this.#modes, s);
  /** The strategist's policy, the same way. */
  readonly stancePolicy: StancePolicy = (s) => this.#lookup(this.#stances, s);

  /** Drive this colony (a new world or ant count is a new colony; the caches carry over: situations do not depend on the map). */
  attach(colony: Colony): void {
    this.#colony = colony;
    colony.policy = this.policy;
    colony.stancePolicy = this.stancePolicy;
    colony.reconsider();
  }

  /** A new doctrine: its own caches (free if it was used before), and every ant reconsiders under it. */
  setDoctrine(text: string): void {
    this.#doctrine = text;
    let changed = false;
    for (const l of [this.#modes, this.#stances] as Lane<unknown, string>[]) {
      const context = l.contextOf(text);
      if (context === l.context) continue;
      l.context = context;
      l.queue.clear();
      changed = true;
    }
    if (!changed) return;
    this.#set({ cached: this.#cache(this.#modes).size, stancesCached: this.#cache(this.#stances).size });
    this.#colony?.reconsider();
  }

  async start(caps: Partial<RunCaps> = COLONY_CAPS): Promise<void> {
    let run: RunSummary;
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", caps: { ...COLONY_CAPS, ...caps } }) });
      run = (await res.json()) as RunSummary;
      if (!res.ok) {
        this.#set({ lastError: (run as unknown as { error?: string }).error ?? `start failed (${res.status})` });
        return;
      }
    } catch (e) {
      this.#set({ lastError: `start failed: ${String(e)}` });
      return;
    }
    this.#runSeq++;
    this.#aborter = new AbortController();
    this.#clearQueues();
    this.#cooldown = 0;
    this.#set({ phase: "running", run, asked: 0, stancesAsked: 0, requests: 0, hits: 0, misses: 0, failures: 0, lastError: null, cached: this.#cache(this.#modes).size, stancesCached: this.#cache(this.#stances).size });
    this.#colony?.reconsider();
    if (this.#timer === null) this.#timer = setInterval(() => this.#cycle(), this.opts.intervalMs);
  }

  async stop(): Promise<void> {
    this.#halt();
    this.#aborter.abort();
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      this.#set({ phase: "stopped", run: (await res.json()) as RunSummary });
    } catch (e) {
      this.#set({ phase: "stopped", lastError: String(e) });
    }
  }

  dispose(): void {
    this.#halt();
    this.#aborter.abort();
    this.#listeners.clear();
  }

  #clearQueues(): void {
    for (const l of [this.#modes, this.#stances] as Lane<unknown, string>[]) {
      l.queue.clear();
      l.asking.clear();
    }
  }

  #halt(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#clearQueues();
    if (this.#state.phase === "running") this.#set({ phase: "stopped" });
    this.#colony?.reconsider(); // back to the local rule at once
  }

  #cycle(): void {
    if (this.#state.phase !== "running") return;
    if (this.#cooldown > 0) {
      this.#cooldown--;
      return;
    }
    for (const l of [this.#stances, this.#modes] as Lane<unknown, string>[]) {
      while (this.#inFlight < this.opts.inFlight && l.queue.size > 0) {
        const batch = [...l.queue.entries()].slice(0, this.opts.batch);
        for (const [k] of batch) {
          l.queue.delete(k);
          l.asking.add(k);
        }
        void this.#ask(l, batch);
      }
    }
  }

  async #ask<S, A extends string>(l: Lane<S, A>, batch: [string, S][]): Promise<void> {
    const seq = this.#runSeq;
    const context = l.context;
    const items = batch.map(([key, situation], n) => ({ id: `${l.name === "mode" ? "s" : "c"}${n}`, key, situation }));
    const counted = l.name === "mode" ? "asked" : "stancesAsked";
    this.#inFlight++;
    this.#set({ [counted]: this.#state[counted] + items.length, requests: this.#state.requests + 1 });
    let reply: JevProxyReply | null = null;
    let error: string | null = null;
    try {
      const res = await fetch("/api/jev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(l.pack(items, this.#doctrine)), signal: this.#aborter.signal });
      const body = (await res.json()) as JevProxyReply | { error: string; run?: RunSummary };
      if (res.status === 409) {
        const run = (body as { run?: RunSummary }).run ?? null;
        this.#halt();
        this.#set({ phase: "stopped", run, lastError: `Jev stopped: ${(body as { error?: string }).error ?? "run over"}. Ants are on the local rule.` });
        return;
      }
      if (res.status === 429 && (body as { error?: string }).error === "busy") {
        if (seq === this.#runSeq) for (const it of items) l.queue.set(it.key, it.situation); // ask again next cycle
        this.#set({ [counted]: this.#state[counted] - items.length, run: (body as { run?: RunSummary }).run ?? this.#state.run });
        return;
      }
      if (!res.ok) error = (body as { error: string }).error ?? `HTTP ${res.status}`;
      else reply = body as JevProxyReply;
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "AbortError") return; // Stop cut it
      error = String(err);
    } finally {
      this.#inFlight--;
      for (const it of items) l.asking.delete(it.key);
    }
    if (!reply || reply.status !== 200 || !reply.body || !("answers" in reply.body)) {
      // Not billed as a reply; the colony keeps the local rule and meets the situation again later.
      this.#cooldown = 5;
      this.#set({ failures: this.#state.failures + 1, lastError: error ?? `jev answered ${reply?.status ?? "?"}`, run: reply?.run ?? this.#state.run });
      return;
    }
    // A billed answer is kept under the doctrine it was asked under, whichever run or doctrine is current now.
    const cache = this.#cache(l, context);
    const answers = (reply.body as JevResponse).answers;
    for (const it of items) {
      const a = l.read(answers, it.id);
      if (a) cache.put(it.key, a);
    }
    this.#store?.save(context, cache.entries());
    this.#set({ run: reply.run, cached: this.#cache(this.#modes).size, stancesCached: this.#cache(this.#stances).size, lastError: null });
    if (seq === this.#runSeq && context === l.context) this.#colony?.reconsider();
  }
}
