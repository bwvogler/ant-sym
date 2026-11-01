import type { JevAnswer, JevProxyReply, JevRequest, JevResponse, RunCaps, RunSummary } from "../../shared/jev.ts";
import { localPolicy, localStance, type Colony, type Mode, type Policy, type Situation, type Stance, type StancePolicy, type StanceSituation } from "../colony/colony.ts";
import { packModeRequest, packStanceRequest, policyContext, readMode, readStance, situationKey, stanceContext, stanceKey } from "../colony/colonyBrain.ts";
import { localFungusRule, type FungalSituation, type FungusPolicy } from "../colony/fungalPolicy.ts";
import { fungalKey, fungusContext, packFungusRequest, readIntervention } from "../colony/fungusBrain.ts";
import { INTERVENTIONS, LETHAL, type Fungus } from "../colony/fungus.ts";
import { PolicyCache } from "../sim/policyCache.ts";

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
// at most `batch` situations a request; same proxy, same ledger, same caps as
// the picture: a 409 ends the run and everyone carries on locally.

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
  /** this run: situations sent to Jev (ant modes and stances, every colony), requests sent */
  asked: number;
  stancesAsked: number;
  requests: number;
  /** this run: mode choices answered from the cache, and by the local rule while a situation was unanswered */
  hits: number;
  misses: number;
  /** answers cached for the first colony's doctrine (modes, stances) */
  cached: number;
  stancesCached: number;
  /** mode answers cached for each colony's doctrine */
  doctrineCached: number[];
  /** this run: fungal situations sent to Jev; answers cached for the current aim and menu */
  fungusAsked: number;
  fungusCached: number;
  failures: number;
  lastError: string | null;
}

type Listener = (s: ColonyJevState) => void;

/** One stream of questions: how to key, pack and read them, the local fallback, and the words they are asked under. */
interface Lane<S, A extends string> {
  name: "mode" | "stance" | "fungus";
  key: (s: S) => string;
  pack: (items: { id: string; situation: S }[], words: string) => JevRequest;
  read: (answers: Record<string, JevAnswer>, id: string, situation: S) => A | null;
  local: (s: S) => A;
  contextOf: (words: string) => string;
  /** the words its requests carry: a colony's doctrine, or the fungus's aim */
  words: string;
  context: string;
  queue: Map<string, S>;
}

/** In-flight questions are per context: a situation asked under one doctrine is still unasked under another. */
function askKey(context: string, key: string): string {
  return `${context}\u0000${key}`;
}

function lane<S, A extends string>(spec: Pick<Lane<S, A>, "name" | "key" | "pack" | "read" | "local" | "contextOf" | "words">): Lane<S, A> {
  return { ...spec, context: spec.contextOf(spec.words), queue: new Map() };
}

/** A colony this client drives: its two lanes. */
interface Driven {
  colony: Colony;
  modes: Lane<Situation, Mode>;
  stances: Lane<StanceSituation, Stance>;
}

export class ColonyJev {
  opts: ColonyJevOptions;
  #driven: Driven[] = [];
  /** each colony's doctrine, by index (kept across games: a new world keeps the colonies' natures) */
  #doctrines: string[] = [];
  #store: CacheStore | null;
  #fungus: Fungus | null = null;
  /** the menu the fungus lane asks under: the attached fungus's, or every non-lethal intervention */
  #menu: Set<string> = new Set(INTERVENTIONS.map((v) => v.id).filter((id) => !LETHAL.has(id)));
  #fungal = lane<FungalSituation, string>({
    name: "fungus",
    key: fungalKey,
    pack: (items, aim) => packFungusRequest(items, aim, this.#menu),
    read: (a, id, s) => readIntervention(a, id, s, this.#menu),
    local: (s) => (this.#fungus ? this.#fungus.local(s) : localFungusRule()(s)),
    contextOf: (aim) => fungusContext(aim, this.#menu),
    words: "",
  });
  /** caches by context, shared by every lane asking under it */
  #caches = new Map<string, PolicyCache<string>>();
  /** questions in flight, by askKey(context, key), across lanes */
  #asking = new Set<string>();
  #inFlight = 0;
  #timer: ReturnType<typeof setInterval> | null = null;
  #aborter = new AbortController();
  #runSeq = 0;
  /** cycles to sit out after a failed call, so a broken upstream is not hammered */
  #cooldown = 0;
  #listeners = new Set<Listener>();
  #state: ColonyJevState = { phase: "off", run: null, asked: 0, stancesAsked: 0, requests: 0, hits: 0, misses: 0, cached: 0, stancesCached: 0, doctrineCached: [], fungusAsked: 0, fungusCached: 0, failures: 0, lastError: null };

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
      c = new PolicyCache<string>(context, this.#store?.load(context) ?? []);
      this.#caches.set(context, c);
    }
    return c as unknown as PolicyCache<A>;
  }

  /** The cache sizes the panel shows. */
  #counts(): Pick<ColonyJevState, "cached" | "stancesCached" | "doctrineCached" | "fungusCached"> {
    const first = this.#driven[0];
    return {
      cached: first ? this.#cache(first.modes).size : 0,
      stancesCached: first ? this.#cache(first.stances).size : 0,
      doctrineCached: this.#driven.map((d) => this.#cache(d.modes).size),
      fungusCached: this.#cache(this.#fungal).size,
    };
  }

  #lookup<S, A extends string>(l: Lane<S, A>, s: S): A {
    if (this.#state.phase !== "running") return l.local(s);
    const key = l.key(s);
    const hit = this.#cache(l).get(key);
    if (l.name === "mode") {
      if (hit) this.#state.hits++;
      else this.#state.misses++;
    }
    if (hit) return hit;
    if (!this.#asking.has(askKey(l.context, key))) l.queue.set(key, s);
    return l.local(s);
  }

  /** Who decides, in lane l, situation s right now: Jev's cached answer, the local rule while Jev is asked, or the local rule. Counts and queues nothing. */
  #explain<S, A extends string>(l: Lane<S, A>, s: S): { answer: A; by: "jev" | "waiting" | "local" } {
    const local = l.local(s);
    if (this.#state.phase !== "running") return { answer: local, by: "local" };
    const key = l.key(s);
    const hit = this.#cache(l).get(key);
    if (hit) return { answer: hit, by: "jev" };
    return { answer: local, by: l.queue.has(key) || this.#asking.has(askKey(l.context, key)) ? "waiting" : "local" };
  }

  /** Who decides an ant of colony k in situation `s` right now (the follow card). */
  explain(s: Situation, k = 0): { mode: Mode; by: "jev" | "waiting" | "local" } {
    const d = this.#driven[k];
    if (!d) return { mode: localPolicy(s), by: "local" };
    const e = this.#explain(d.modes, s);
    return { mode: e.answer, by: e.by };
  }

  /** The first colony's ants' policy (kept for a single colony; each attached colony is given its own). */
  readonly policy: Policy = (s) => {
    const d = this.#driven[0];
    return d ? this.#lookup(d.modes, s) : localPolicy(s);
  };
  /** The first colony's strategist's policy, the same way. */
  readonly stancePolicy: StancePolicy = (s) => {
    const d = this.#driven[0];
    return d ? this.#lookup(d.stances, s) : localStance(s);
  };

  /** The fungus's policy, the same way, on its own lane: what the fungus does to a host in this fungal situation. */
  readonly fungusPolicy: FungusPolicy = (s) => this.#lookup(this.#fungal, s);

  /** Who decides what the fungus does in situation `s` right now (the follow card). */
  explainFungus(s: FungalSituation): { answer: string; by: "jev" | "waiting" | "local" } {
    return this.#explain(this.#fungal, s);
  }

  /** Drive the game's fungus: its policy becomes this lane (Jev's cached answer while a run is on, else the fungus's local rule). */
  attachFungus(fungus: Fungus): void {
    this.#fungus = fungus;
    fungus.policy = this.fungusPolicy;
    this.setMenu(fungus.menu);
  }

  /** The player's aim for the fungus: its own caches (free if used before). */
  setAim(text: string): void {
    this.#recontext(this.#fungal, text);
  }

  /** The player's menu: what the fungus may run. It is part of every fungus question, so it is part of the cache's context. */
  setMenu(menu: Set<string>): void {
    this.#menu = new Set(menu);
    if (this.#fungus) this.#fungus.menu = new Set(menu);
    this.#fungal.context = "";
    this.#recontext(this.#fungal, this.#fungal.words);
  }

  /** New words for a lane: its own cache (free if used before), and a fresh queue. Returns whether the context changed. */
  #recontext<S, A extends string>(l: Lane<S, A>, words: string): boolean {
    l.words = words;
    const context = l.contextOf(words);
    if (context === l.context) return false;
    l.context = context;
    l.queue.clear();
    this.#set(this.#counts());
    return true;
  }

  /** Drive this one colony (kept for a single colony; see attachColonies). */
  attach(colony: Colony): void {
    this.attachColonies([colony]);
  }

  /**
   * Drive these colonies, each under its own doctrine (a new world is new colonies; the caches carry over:
   * situations depend on neither the colony nor the map). Each colony's policies become its own lanes.
   */
  attachColonies(colonies: readonly Colony[]): void {
    this.#driven = colonies.map((colony, k) => {
      const words = this.#doctrines[k] ?? this.#doctrines[0] ?? "";
      const d: Driven = {
        colony,
        modes: lane<Situation, Mode>({ name: "mode", key: situationKey, pack: packModeRequest, read: (a, id) => readMode(a, id), local: localPolicy, contextOf: policyContext, words }),
        stances: lane<StanceSituation, Stance>({ name: "stance", key: stanceKey, pack: packStanceRequest, read: (a, id) => readStance(a, id), local: localStance, contextOf: stanceContext, words }),
      };
      colony.policy = (s) => this.#lookup(d.modes, s);
      colony.stancePolicy = (s) => this.#lookup(d.stances, s);
      colony.reconsider();
      return d;
    });
    this.#set(this.#counts());
  }

  /** The first colony's doctrine (see setDoctrineFor). */
  setDoctrine(text: string): void {
    this.setDoctrineFor(0, text);
  }

  /** A new doctrine for colony k: its own caches (free if used before, by either colony), and its ants reconsider under it. */
  setDoctrineFor(k: number, text: string): void {
    this.#doctrines[k] = text;
    const d = this.#driven[k];
    if (!d) return;
    const a = this.#recontext(d.modes, text);
    const b = this.#recontext(d.stances, text);
    if (a || b) d.colony.reconsider();
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
    this.#set({ phase: "running", run, asked: 0, stancesAsked: 0, fungusAsked: 0, requests: 0, hits: 0, misses: 0, failures: 0, lastError: null, ...this.#counts() });
    this.#reconsider();
    if (this.#timer === null) this.#timer = setInterval(() => this.#cycle(), this.opts.intervalMs);
  }

  async stop(): Promise<void> {
    this.#halt();
    this.#aborter.abort();
    // If Start is pressed again before this reply lands, the reply belongs to the old run: ignore it.
    const seq = this.#runSeq;
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "stop" }) });
      const run = (await res.json()) as RunSummary;
      if (seq === this.#runSeq) this.#set({ phase: "stopped", run });
    } catch (e) {
      if (seq === this.#runSeq) this.#set({ phase: "stopped", lastError: String(e) });
    }
  }

  dispose(): void {
    this.#halt();
    this.#aborter.abort();
    this.#listeners.clear();
  }

  #reconsider(): void {
    for (const d of this.#driven) d.colony.reconsider();
  }

  #lanes(): Lane<unknown, string>[] {
    const out: Lane<unknown, string>[] = [];
    for (const d of this.#driven) out.push(d.stances as Lane<unknown, string>, d.modes as Lane<unknown, string>);
    out.push(this.#fungal as Lane<unknown, string>);
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
    if (this.#state.phase === "running") this.#set({ phase: "stopped" });
    this.#reconsider(); // back to the local rule at once
  }

  #cycle(): void {
    if (this.#state.phase !== "running") return;
    if (this.#cooldown > 0) {
      this.#cooldown--;
      return;
    }
    for (const l of this.#lanes()) {
      while (this.#inFlight < this.opts.inFlight && l.queue.size > 0) {
        const batch: [string, unknown][] = [];
        for (const [k, s] of l.queue) {
          if (batch.length >= this.opts.batch) break;
          l.queue.delete(k);
          // Another colony's lane may be asking it under the same context already: one question, one answer for both.
          if (this.#asking.has(askKey(l.context, k))) continue;
          this.#asking.add(askKey(l.context, k));
          batch.push([k, s]);
        }
        if (batch.length) void this.#ask(l, batch);
      }
    }
  }

  async #ask<S, A extends string>(l: Lane<S, A>, batch: [string, S][]): Promise<void> {
    const seq = this.#runSeq;
    const context = l.context;
    const items = batch.map(([key, situation], n) => ({ id: `${l.name === "mode" ? "s" : l.name === "stance" ? "c" : "h"}${n}`, key, situation }));
    const counted = l.name === "mode" ? "asked" : l.name === "stance" ? "stancesAsked" : "fungusAsked";
    this.#inFlight++;
    this.#set({ [counted]: this.#state[counted] + items.length, requests: this.#state.requests + 1 });
    let reply: JevProxyReply | null = null;
    let error: string | null = null;
    try {
      const res = await fetch("/api/jev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(l.pack(items, l.words)), signal: this.#aborter.signal });
      const body = (await res.json()) as JevProxyReply | { error: string; run?: RunSummary };
      if (res.status === 409) {
        const run = (body as { run?: RunSummary }).run ?? null;
        this.#halt();
        this.#set({ phase: "stopped", run, lastError: `Jev stopped: ${(body as { error?: string }).error ?? "run over"}. Ants are on the local rule.` });
        return;
      }
      if (res.status === 429 && (body as { error?: string }).error === "busy") {
        // Ask again next cycle, but only for the context it was asked under and only what that context hasn't cached since.
        if (seq === this.#runSeq && context === l.context) for (const it of items) if (!this.#cache(l).get(it.key)) l.queue.set(it.key, it.situation);
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
      for (const it of items) this.#asking.delete(askKey(context, it.key));
    }
    if (!reply || reply.status !== 200 || !reply.body || !("answers" in reply.body)) {
      // Not billed as a reply; everyone keeps the local rule and meets the situation again later.
      this.#cooldown = 5;
      this.#set({ failures: this.#state.failures + 1, lastError: error ?? `jev answered ${reply?.status ?? "?"}`, run: reply?.run ?? this.#state.run });
      return;
    }
    // A billed answer is kept under the context it was asked under, whichever run or doctrine is current now.
    const cache = this.#cache(l, context);
    const answers = (reply.body as JevResponse).answers;
    for (const it of items) {
      const a = l.read(answers, it.id, it.situation);
      if (a) cache.put(it.key, a);
    }
    this.#store?.save(context, cache.entries());
    this.#set({ run: reply.run, lastError: null, ...this.#counts() });
    // The fungus asks its policy every step, so its new answers take hold by themselves; the ants reconsider.
    if (seq === this.#runSeq && l.name !== "fungus") this.#reconsider();
  }
}
