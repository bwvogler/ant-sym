import type { JevProxyReply, JevResponse, RunCaps, RunSummary } from "../../shared/jev.ts";
import { localPolicy, type Colony, type Mode, type Policy, type Situation } from "../colony/colony.ts";
import { packModeRequest, policyContext, readMode, situationKey } from "../colony/colonyBrain.ts";
import { PolicyCache } from "../sim/policyCache.ts";

// The colony's Jev client: the counterpart of JevScheduler for the mode
// choice. The colony needs an answer at once, so the policy it is given is
// synchronous: a cached answer for this doctrine if there is one, otherwise
// the local rule for now while the situation is queued. Every interval the
// queue goes to Jev, at most `batch` situations a request; each answer is
// cached and every ant reconsiders, so Jev's choice takes over within a
// tick. Same proxy, same ledger, same caps as the picture: a 409 ends the
// run and the colony carries on with the local rule.

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
  load(context: string): [string, Mode][];
  save(context: string, entries: [string, Mode][]): void;
}

export interface ColonyJevState {
  phase: "off" | "running" | "stopped";
  run: RunSummary | null;
  /** this run: situations sent to Jev, requests sent */
  asked: number;
  requests: number;
  /** this run: mode choices answered from the cache, and by the local rule while a situation was unanswered */
  hits: number;
  misses: number;
  /** answers cached for the current doctrine */
  cached: number;
  failures: number;
  lastError: string | null;
}

type Listener = (s: ColonyJevState) => void;

export class ColonyJev {
  opts: ColonyJevOptions;
  #colony: Colony | null = null;
  #doctrine = "";
  #context = policyContext("");
  #caches = new Map<string, PolicyCache<Mode>>();
  #store: CacheStore | null;
  /** situations waiting to be asked (key → situation), and those with a call open */
  #queue = new Map<string, Situation>();
  #asking = new Set<string>();
  #inFlight = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #aborter = new AbortController();
  #runSeq = 0;
  /** cycles to sit out after a failed call, so a broken upstream is not hammered */
  #cooldown = 0;
  #listeners = new Set<Listener>();
  #state: ColonyJevState = { phase: "off", run: null, asked: 0, requests: 0, hits: 0, misses: 0, cached: 0, failures: 0, lastError: null };

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

  #cache(): PolicyCache<Mode> {
    let c = this.#caches.get(this.#context);
    if (!c) {
      c = new PolicyCache<Mode>(this.#context, this.#store?.load(this.#context) ?? []);
      this.#caches.set(this.#context, c);
    }
    return c;
  }

  /** The policy the colony calls: Jev's cached answer while a run is on, else the local rule (queuing what Jev has not answered). */
  readonly policy: Policy = (s) => {
    if (this.#state.phase !== "running") return localPolicy(s);
    const key = situationKey(s);
    const hit = this.#cache().get(key);
    if (hit) {
      this.#state.hits++;
      return hit;
    }
    this.#state.misses++;
    if (!this.#asking.has(key)) this.#queue.set(key, s);
    return localPolicy(s);
  };

  /** Drive this colony (a new world or ant count is a new colony; the cache carries over: situations do not depend on the map). */
  attach(colony: Colony): void {
    this.#colony = colony;
    colony.policy = this.policy;
    colony.reconsider();
  }

  /** A new doctrine: its own cache (free if it was used before), and every ant reconsiders under it. */
  setDoctrine(text: string): void {
    const context = policyContext(text);
    this.#doctrine = text;
    if (context === this.#context) return;
    this.#context = context;
    this.#queue.clear();
    this.#set({ cached: this.#cache().size });
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
    this.#queue.clear();
    this.#asking.clear();
    this.#cooldown = 0;
    this.#set({ phase: "running", run, asked: 0, requests: 0, hits: 0, misses: 0, failures: 0, lastError: null, cached: this.#cache().size });
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

  #halt(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#queue.clear();
    this.#asking.clear();
    if (this.#state.phase === "running") this.#set({ phase: "stopped" });
    this.#colony?.reconsider(); // back to the local rule at once
  }

  #cycle(): void {
    if (this.#state.phase !== "running") return;
    if (this.#cooldown > 0) {
      this.#cooldown--;
      return;
    }
    while (this.#inFlight < this.opts.inFlight && this.#queue.size > 0) {
      const batch = [...this.#queue.entries()].slice(0, this.opts.batch);
      for (const [k] of batch) {
        this.#queue.delete(k);
        this.#asking.add(k);
      }
      void this.#ask(batch);
    }
  }

  async #ask(batch: [string, Situation][]): Promise<void> {
    const seq = this.#runSeq;
    const context = this.#context;
    const items = batch.map(([key, situation], n) => ({ id: `s${n}`, key, situation }));
    this.#inFlight++;
    this.#set({ asked: this.#state.asked + items.length, requests: this.#state.requests + 1 });
    let reply: JevProxyReply | null = null;
    let error: string | null = null;
    try {
      const res = await fetch("/api/jev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(packModeRequest(items, this.#doctrine)), signal: this.#aborter.signal });
      const body = (await res.json()) as JevProxyReply | { error: string; run?: RunSummary };
      if (res.status === 409) {
        const run = (body as { run?: RunSummary }).run ?? null;
        this.#halt();
        this.#set({ phase: "stopped", run, lastError: `Jev stopped: ${(body as { error?: string }).error ?? "run over"}. Ants are on the local rule.` });
        return;
      }
      if (res.status === 429 && (body as { error?: string }).error === "busy") {
        if (seq === this.#runSeq) for (const it of items) this.#queue.set(it.key, it.situation); // ask again next cycle
        this.#set({ asked: this.#state.asked - items.length, run: (body as { run?: RunSummary }).run ?? this.#state.run });
        return;
      }
      if (!res.ok) error = (body as { error: string }).error ?? `HTTP ${res.status}`;
      else reply = body as JevProxyReply;
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "AbortError") return; // Stop cut it
      error = String(err);
    } finally {
      this.#inFlight--;
      for (const it of items) this.#asking.delete(it.key);
    }
    if (!reply || reply.status !== 200 || !reply.body || !("answers" in reply.body)) {
      // Not billed as a reply; the ants keep the local rule and meet the situation again later.
      this.#cooldown = 5;
      this.#set({ failures: this.#state.failures + 1, lastError: error ?? `jev answered ${reply?.status ?? "?"}`, run: reply?.run ?? this.#state.run });
      return;
    }
    // A billed answer is kept under the doctrine it was asked under, whichever run or doctrine is current now.
    const cache = this.#caches.get(context) ?? this.#cache();
    const answers = (reply.body as JevResponse).answers;
    for (const it of items) {
      const mode = readMode(answers, it.id);
      if (mode) cache.put(it.key, mode);
    }
    this.#store?.save(context, cache.entries());
    this.#set({ run: reply.run, cached: this.#cache().size, lastError: null });
    if (seq === this.#runSeq && context === this.#context) this.#colony?.reconsider();
  }
}
