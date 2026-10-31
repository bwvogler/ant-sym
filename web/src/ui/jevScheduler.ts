import type { JevProxyReply, JevRequest, JevResponse, RunCaps, RunSummary } from "../../shared/jev.ts";
import type { Engine } from "../sim/engine.ts";
import { antState, applyDecision, calibration, packRequest, POLICY_CONTEXT, readDecision, type AntState, type Neutral, type Schema } from "../sim/jevBrain.ts";
import { answersFor, canonicalState, PolicyCache, readSituation, situationKey, type CachedAnswer, type Transform } from "../sim/policyCache.ts";
import { boxArea, boxCentre, boxInkShare, buildOverseerRequest, readOverseer, type Box } from "../sim/overseer.ts";
import { overseerImages } from "./overseerImages.ts";
import type { JevAnswer } from "../../shared/jev.ts";

// Drives the Jev brain against the proxy. Every `intervalMs` it takes the
// stalest due ants that are at least `minAgeSeconds` past their last
// decision, packs them `batch` at a time, and keeps at most `inFlight`
// requests open. Ants with a request in flight keep walking on their last
// heading (commit is parked high so they are not picked twice). A reply
// becomes decisions; a failed call hands those ants to the local rule once.
// A 409 from the server means a cap fired (or the run was stopped): the
// scheduler goes idle and releases every ant to the local rule.
//
// Schema "cached" asks per situation instead of per ant: a due ant whose
// situation is in the cache decides from the cached answer without a call;
// the rest park on their situation, each new situation is asked once however
// many ants wait on it, and the reply fills the cache and decides for every
// ant parked there. Hits keep the minimum age: the coast between decisions is
// part of how the brain moves ants (deciding every cycle instead, ants at a
// peak of the far field turned on the spot and the picture stalled at 70 %,
// scripts/situations.mjs).

export interface SchedulerOptions {
  schema: Schema;
  batch: number;
  inFlight: number;
  intervalMs: number;
  minAgeSeconds: number;
  /** sample the compass choice from its probabilities instead of argmax */
  sample: boolean;
  /** the image overseer: on/off and how often it looks, ms */
  overseer: boolean;
  overseerMs: number;
  /** renders the target and the field as base64 PNGs; injectable so the overseer loop runs headless in tests */
  renderImages: (target: Float32Array, occupancy: Uint16Array, size: { w: number; h: number }) => Promise<{ target: string; current: string }>;
}

// inFlight 5: browsers allow 6 connections per host, and Stop needs one to reach the server at once.
export const DEFAULT_SCHEDULER: SchedulerOptions = { schema: "compass", batch: 100, inFlight: 5, intervalMs: 200, minAgeSeconds: 1.5, sample: false, overseer: true, overseerMs: 4000, renderImages: overseerImages };

export interface OverseerState {
  box: Box | null;
  /** did the box pass the sanity check and become the attractor */
  steering: boolean;
  done: number;
  inputTokens: number;
  ms: number;
  calls: number;
  /** tokens spent by the overseer this run */
  tokensThisRun: number;
  at: number;
}

export interface Sample {
  id: string;
  state: AntState;
  answers: Record<string, JevAnswer>;
  decision: { heading: string | null; settle: boolean; strength: number; pSettle: number } | null;
  /** the cached schema: the situation key the answer was asked (or cached) under */
  situation?: string;
}

/** The cached schema's counters for this run; `situations` is the cache's size across runs. */
export interface CacheStats {
  /** ant decisions read from the cache, no call */
  hits: number;
  /** ant decisions that waited on a call for their situation */
  waited: number;
  /** situations sent to Jev */
  asked: number;
  situations: number;
}

export interface SchedulerState {
  phase: "idle" | "running" | "stopped";
  run: RunSummary | null;
  pending: number;
  requestsSent: number;
  failures: number;
  lastError: string | null;
  sample: Sample | null;
  /** the last reply's neutral point (what Jev answers for an ant with nothing around it) */
  neutral: Neutral | null;
  overseer: OverseerState | null;
  /** engine.targetVersion when the last run ended */
  stoppedOnTarget: number;
  /** why the browser side ended the run (the server's stopReason covers caps) */
  stoppedFor: "user" | "formed" | "blank" | null;
  /** client-side running total across runs this page-load, dollars */
  sessionUsd: number;
  sessionTokens: number;
  cache: CacheStats;
}

type Listener = (s: SchedulerState) => void;

/** How one call to the proxy ended. */
type PostResult = { kind: "halted" } | { kind: "aborted" } | { kind: "busy" } | { kind: "failed"; error: string; run: RunSummary | null } | { kind: "ok"; answers: Record<string, JevAnswer>; run: RunSummary };

export class JevScheduler {
  #engine: Engine;
  opts: SchedulerOptions;
  #timer: ReturnType<typeof setInterval> | null = null;
  #overseerTimer: ReturnType<typeof setInterval> | null = null;
  #overseerBusy = false;
  #inFlight = 0;
  /** Cuts this run's browser-side fetches on Stop, so the connections are free for the stop call itself. */
  #aborter = new AbortController();
  /** Bumps on every start, so a look that began in an old run cannot steer the new one. */
  #runSeq = 0;
  #pending: Uint8Array;
  #listeners = new Set<Listener>();
  #state: SchedulerState = { phase: "idle", run: null, pending: 0, requestsSent: 0, failures: 0, lastError: null, sample: null, neutral: null, overseer: null, stoppedOnTarget: 0, stoppedFor: null, sessionUsd: 0, sessionTokens: 0, cache: { hits: 0, waited: 0, asked: 0, situations: 0 } };
  #startedAt = 0;
  /** situation → Jev's answer; kept across runs (and, through useJev, across page loads) */
  readonly cache: PolicyCache;
  /** situations with a call in flight, and the ants parked on each */
  #asking = new Set<string>();
  #waiting = new Map<string, { i: number; state: AntState; transform: Transform }[]>();

  constructor(engine: Engine, opts: Partial<SchedulerOptions> = {}, cache: PolicyCache = new PolicyCache(POLICY_CONTEXT)) {
    this.#engine = engine;
    this.opts = { ...DEFAULT_SCHEDULER, ...opts };
    this.#pending = new Uint8Array(engine.world.n);
    this.cache = cache;
    this.#state.cache.situations = cache.size;
  }

  /** Forget every cached answer, so the next run is a cold one. */
  clearCache(): void {
    this.cache.clear();
    this.#set({ cache: { ...this.#state.cache, situations: 0 } });
  }

  get state(): SchedulerState {
    return this.#state;
  }

  setOptions(patch: Partial<SchedulerOptions>): void {
    this.opts = { ...this.opts, ...patch };
  }

  subscribe(fn: Listener): () => void {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  }

  #set(patch: Partial<SchedulerState>): void {
    this.#state = { ...this.#state, ...patch };
    for (const fn of this.#listeners) fn(this.#state);
  }

  /** Start a run on the server and begin scheduling. */
  async start(caps: Partial<RunCaps>): Promise<void> {
    // The previous run's grace-period calls may have landed since its stop: take their final line first.
    if (this.#state.phase === "stopped") await this.#refresh();
    let run: RunSummary;
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "start", caps }) });
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
    this.#resizePending();
    this.#pending.fill(0);
    this.#asking.clear();
    this.#waiting.clear();
    // A picture that is already half there (the local rule, or a previous run)
    // leaves Jev nothing to do: scatter so the run is a formation from scratch.
    if (this.#engine.coverage > 0.5) this.#engine.scatter();
    this.#engine.jevOwned.fill(1);
    this.#engine.params.brain = "jev";
    this.#startedAt = performance.now();
    this.#set({ phase: "running", run, lastError: null, requestsSent: 0, failures: 0, overseer: null, stoppedFor: null, cache: { hits: 0, waited: 0, asked: 0, situations: this.cache.size } });
    this.#engine.attractor = null;
    if (this.#timer === null) this.#timer = setInterval(() => void this.#cycle(), this.opts.intervalMs);
    if (this.#overseerTimer === null) this.#overseerTimer = setInterval(() => void this.#oversee(), this.opts.overseerMs);
  }

  /** Seconds since Start, for the "formed" rule. */
  get runSeconds(): number {
    return this.#state.phase === "running" ? (performance.now() - this.#startedAt) / 1000 : 0;
  }

  /** Stop: tell the server why, go idle, hand every ant back to the local rule. */
  async stop(reason: "user" | "formed" | "blank" = "user"): Promise<void> {
    this.#halt();
    this.#set({ stoppedFor: reason });
    // Drop the browser side of every open call first: the server gives a call
    // already on the wire a short grace and counts it, so nothing is lost, and
    // the stop request does not queue behind them.
    this.#aborter.abort();
    try {
      const res = await fetch("/api/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: reason === "formed" ? "formed" : "stop" }) });
      const run = (await res.json()) as RunSummary;
      this.#absorb(run);
      this.#set({ phase: "stopped", run });
      // Calls finishing in their grace land after this reply: read the final line once they have.
      setTimeout(() => void this.#refresh(), 2500);
    } catch (e) {
      this.#set({ phase: "stopped", lastError: String(e) });
    }
  }

  async #refresh(): Promise<void> {
    if (this.#state.phase !== "stopped") return;
    try {
      const run = (await (await fetch("/api/run")).json()) as RunSummary;
      this.#absorb(run);
      this.#set({ run });
    } catch {
      // the next start or stop reads it again
    }
  }

  #halt(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    if (this.#overseerTimer !== null) {
      clearInterval(this.#overseerTimer);
      this.#overseerTimer = null;
    }
    this.#engine.attractor = null;
    const overseer = this.#state.overseer;
    this.#set({ stoppedOnTarget: this.#engine.targetVersion, overseer: overseer ? { ...overseer, box: null, steering: false } : null });
    this.#engine.jevOwned.fill(0);
    // After a run the stragglers finish with the local rule, so a formed
    // picture stays formed without spending.
    this.#engine.idleBehaviour = "local";
    // Ants with a request in flight: let the local rule take them now; a late
    // reply is ignored because they are no longer pending.
    for (let i = 0; i < this.#pending.length; i++) {
      if (this.#pending[i]) {
        this.#pending[i] = 0;
        this.#engine.world.commit[i] = 0;
      }
    }
    this.#asking.clear();
    this.#waiting.clear();
    this.#set({ pending: 0 });
  }

  dispose(): void {
    this.#halt();
    this.#aborter.abort();
    this.#listeners.clear();
  }

  #resizePending(): void {
    if (this.#pending.length !== this.#engine.world.n) this.#pending = new Uint8Array(this.#engine.world.n);
  }

  /** The session line comes from the server, which sums every billed reply across runs (replies can land out of order: take the max). */
  #absorb(run: RunSummary): void {
    this.#state.sessionTokens = Math.max(this.#state.sessionTokens, run.sessionInputTokens ?? 0);
    this.#state.sessionUsd = Math.max(this.#state.sessionUsd, run.sessionUsd ?? 0);
  }

  async #oversee(): Promise<void> {
    if (!this.opts.overseer || this.#state.phase !== "running" || this.#overseerBusy) return;
    const e = this.#engine;
    const seq = this.#runSeq;
    this.#overseerBusy = true;
    try {
      const images = await this.opts.renderImages(e.target, e.occupancy, e.params.size);
      if (seq !== this.#runSeq || this.#state.phase !== "running") return;
      const res = await fetch("/api/jev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(buildOverseerRequest(images.target, images.current)), signal: this.#aborter.signal });
      const body = (await res.json()) as JevProxyReply | { error: string; run?: RunSummary };
      if (seq !== this.#runSeq || this.#state.phase !== "running") return; // a late look must not steer a later run
      if (res.status === 409) {
        // A cap fired or the run was stopped elsewhere: the same halt as the ant path.
        const run = (body as { run?: RunSummary }).run ?? null;
        this.#halt();
        if (run) this.#absorb(run);
        this.#set({ phase: "stopped", run, lastError: null });
        return;
      }
      if (!res.ok) return; // busy or a server error: skip this look
      const reply = body as JevProxyReply;
      if (reply.status !== 200 || !reply.body || !("answers" in reply.body)) {
        this.#set({ lastError: `overseer: jev answered ${reply.status}` });
        return;
      }
      const reading = readOverseer((reply.body as JevResponse).answers);
      if (!reading) return;
      const steering = reading.box !== null && boxSteers(reading.box, e.target, e.params.size);
      e.attractor = steering && reading.box ? boxCentre(reading.box, e.params.size) : null;
      this.#absorb(reply.run);
      const prev = this.#state.overseer;
      this.#set({
        run: reply.run,
        overseer: { box: reading.box, steering, done: reading.done, inputTokens: reply.inputTokens, ms: reply.ms, calls: (prev?.calls ?? 0) + 1, tokensThisRun: (prev?.tokensThisRun ?? 0) + reply.inputTokens, at: performance.now() },
      });
    } catch (err) {
      if (!isAbort(err)) this.#set({ lastError: `overseer: ${String(err)}` });
    } finally {
      this.#overseerBusy = false;
    }
  }

  async #cycle(): Promise<void> {
    if (this.#state.phase !== "running") return;
    this.#resizePending();
    const e = this.#engine;
    if (e.params.brain !== "jev") return;
    if (this.opts.schema === "cached") return this.#cycleCached();
    const minAge = this.opts.minAgeSeconds;
    const free = this.opts.inFlight - this.#inFlight;
    if (free <= 0) return;
    const due = e.dueAnts().filter((i) => !this.#pending[i] && e.time - (e.world.decidedAt[i] as number) >= minAge);
    if (due.length === 0) return;
    const batches = Math.min(free, Math.ceil(due.length / this.opts.batch));
    for (let b = 0; b < batches; b++) {
      const ids = due.slice(b * this.opts.batch, (b + 1) * this.opts.batch);
      void this.#send(ids);
    }
  }

  /** One POST to the proxy, with the outcomes every caller shares: a 409 halts the scheduler here; the caller releases or decides for its ants. */
  async #post(payload: JevRequest): Promise<PostResult> {
    this.#inFlight++;
    let reply: JevProxyReply | null = null;
    let error: string | null = null;
    try {
      const res = await fetch("/api/jev", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), signal: this.#aborter.signal });
      const body = (await res.json()) as JevProxyReply | { error: string; run?: RunSummary };
      if (res.status === 409) {
        // A cap fired or the run was stopped elsewhere.
        const run = (body as { run?: RunSummary }).run ?? null;
        this.#halt();
        if (run) this.#absorb(run);
        this.#set({ phase: "stopped", run, lastError: null });
        return { kind: "halted" };
      }
      if (res.status === 429 && (body as { error?: string }).error === "busy") {
        // The server's pool is full or the cap has no room for another worst-case
        // call right now: the caller releases its ants to be picked up next cycle, no fallback.
        const run = (body as { run?: RunSummary }).run;
        if (run) this.#absorb(run);
        this.#set({ run: run ?? this.#state.run });
        return { kind: "busy" };
      }
      if (!res.ok) error = (body as { error: string }).error ?? `HTTP ${res.status}`;
      else reply = body as JevProxyReply;
    } catch (err) {
      // Stop cut this call on our side; halt() already released its ants.
      if (isAbort(err)) return { kind: "aborted" };
      error = String(err);
    } finally {
      this.#inFlight--;
    }
    if (!reply || reply.status !== 200 || !reply.body || !("answers" in reply.body)) {
      const msg = error ?? `jev answered ${reply?.status ?? "?"}: ${JSON.stringify(reply?.body ?? "").slice(0, 120)}`;
      this.#set({ failures: this.#state.failures + 1, lastError: msg, run: reply?.run ?? this.#state.run });
      return { kind: "failed", error: msg, run: reply?.run ?? null };
    }
    return { kind: "ok", answers: (reply.body as JevResponse).answers, run: reply.run };
  }

  async #send(indices: number[]): Promise<void> {
    const e = this.#engine;
    const ants = indices.map((i) => ({ id: `a${i}`, state: antState(e, i) }));
    for (const i of indices) {
      this.#pending[i] = 1;
      e.world.commit[i] = 1e9; // keep walking, do not get picked again
    }
    this.#set({ pending: this.#state.pending + indices.length, requestsSent: this.#state.requestsSent + 1 });
    const r = await this.#post(packRequest(ants, this.opts.schema));
    if (r.kind === "halted" || r.kind === "aborted") return;
    if (r.kind === "busy") {
      for (const i of indices) {
        if (this.#pending[i]) {
          this.#pending[i] = 0;
          e.world.commit[i] = 0;
        }
      }
      this.#set({ pending: Math.max(0, this.#state.pending - indices.length) });
      return;
    }
    const stillPending = indices.filter((i) => this.#pending[i]);
    for (const i of stillPending) this.#pending[i] = 0;
    this.#set({ pending: Math.max(0, this.#state.pending - indices.length) });
    if (r.kind === "failed") {
      for (const i of stillPending) e.decideLocally(i);
      return;
    }
    const answers = r.answers;
    const neutral = calibration(answers);
    let sample: Sample | null = null;
    try {
      for (const a of ants) {
        const i = Number(a.id.slice(1));
        if (!stillPending.includes(i)) continue; // halted mid-flight
        const d = readDecision(answers, a.id, this.opts.schema, { sample: this.opts.sample, neutral });
        if (!d) {
          e.decideLocally(i);
          continue;
        }
        applyDecision(e, i, d, a.state);
        if (!sample) {
          const own: Record<string, JevAnswer> = {};
          for (const [k, v] of Object.entries(answers)) if (k.startsWith(`${a.id}_`)) own[k] = v;
          sample = { id: a.id, state: a.state, answers: own, decision: { heading: d.heading === null ? null : compassOf(d.heading), settle: d.settle, strength: d.strength, pSettle: d.pSettle } };
        }
      }
    } catch (err) {
      // A bad answer must not strand the rest of the batch at commit 1e9; the reply was still billed.
      for (const i of stillPending) if ((e.world.commit[i] as number) >= 1e9) e.decideLocally(i);
      this.#absorb(r.run);
      this.#set({ failures: this.#state.failures + 1, lastError: `reading answers: ${String(err)}`, run: r.run });
      return;
    }
    this.#absorb(r.run);
    this.#set({ run: r.run, sample: sample ?? this.#state.sample, neutral, lastError: null });
  }

  /** The cached schema's cycle: hits decide now; misses park on their situation, and each new situation is asked once. */
  #cycleCached(): void {
    const e = this.#engine;
    const minAge = this.opts.minAgeSeconds;
    // How many new situations this cycle can send: the free connections' worth of batches.
    const room = Math.max(0, this.opts.inFlight - this.#inFlight) * this.opts.batch;
    const ask: string[] = [];
    const asking = new Set<string>();
    let hits = 0;
    let parked = 0;
    let sample: Sample | null = null;
    for (const i of e.dueAnts()) {
      if (this.#pending[i] || e.time - (e.world.decidedAt[i] as number) < minAge) continue;
      const state = antState(e, i);
      const { key, transform } = situationKey(state);
      const cached = this.cache.get(key);
      if (cached) {
        const s = this.#applyCached(i, state, key, transform, cached);
        sample ??= s;
        hits++;
        continue;
      }
      if (!this.#asking.has(key) && !asking.has(key)) {
        if (asking.size >= room) continue; // no connection free for it this cycle: the ant is picked up next cycle
        asking.add(key);
        ask.push(key);
      }
      const list = this.#waiting.get(key) ?? [];
      list.push({ i, state, transform });
      this.#waiting.set(key, list);
      this.#pending[i] = 1;
      e.world.commit[i] = 1e9; // keep walking, do not get picked again
      parked++;
    }
    if (hits > 0 || parked > 0) this.#set({ pending: this.#state.pending + parked, cache: { ...this.#state.cache, hits: this.#state.cache.hits + hits }, sample: sample ?? this.#state.sample });
    for (let b = 0; b < ask.length; b += this.opts.batch) void this.#ask(ask.slice(b, b + this.opts.batch));
  }

  /** Decide for ant i from a cached answer, turned back into its frame. A cached answer that cannot be read hands the ant to the local rule. */
  #applyCached(i: number, state: AntState, key: string, transform: Transform, cached: CachedAnswer): Sample | null {
    const e = this.#engine;
    const id = `a${i}`;
    const answers = answersFor(id, cached, transform);
    let d: ReturnType<typeof readDecision> = null;
    try {
      d = readDecision(answers, id, "cached", { sample: this.opts.sample });
    } catch {
      d = null;
    }
    if (!d) {
      e.decideLocally(i);
      return null;
    }
    applyDecision(e, i, d, state);
    return { id, state, answers, situation: key, decision: { heading: d.heading === null ? null : compassOf(d.heading), settle: d.settle, strength: d.strength, pSettle: d.pSettle } };
  }

  /** Ask Jev about new situations, one dir + settle pair each, and decide for every ant parked on them. */
  async #ask(keys: string[]): Promise<void> {
    const e = this.#engine;
    const seq = this.#runSeq;
    for (const k of keys) this.#asking.add(k);
    this.#set({ requestsSent: this.#state.requestsSent + 1, cache: { ...this.#state.cache, asked: this.#state.cache.asked + keys.length } });
    const situations = keys.map((key, n) => ({ id: `s${n}`, key }));
    const r = await this.#post(packRequest(situations.map((s) => ({ id: s.id, state: canonicalState(s.key) })), "cached"));
    // A billed answer is worth keeping whichever run it lands in.
    if (r.kind === "ok") {
      for (const s of situations) {
        const a = readSituation(r.answers, s.id);
        if (a) this.cache.put(s.key, a);
      }
    }
    // Halted, or stopped and started again since: halt() released these ants and start() cleared the parking.
    if (r.kind === "halted" || r.kind === "aborted" || seq !== this.#runSeq) return;
    const waiting = keys.flatMap((k) => {
      const list = this.#waiting.get(k) ?? [];
      this.#waiting.delete(k);
      this.#asking.delete(k);
      return list;
    });
    const still = waiting.filter((w) => this.#pending[w.i]);
    for (const w of still) this.#pending[w.i] = 0;
    const pending = Math.max(0, this.#state.pending - waiting.length);
    if (r.kind === "busy") {
      for (const w of still) e.world.commit[w.i] = 0;
      this.#set({ pending, cache: { ...this.#state.cache, asked: this.#state.cache.asked - keys.length } });
      return;
    }
    if (r.kind === "failed") {
      for (const w of still) e.decideLocally(w.i);
      this.#set({ pending });
      return;
    }
    let sample: Sample | null = null;
    for (const w of still) {
      const { key } = situationKey(w.state);
      const cached = this.cache.get(key);
      if (!cached) {
        e.decideLocally(w.i); // this situation's answer was missing or malformed
        continue;
      }
      const s = this.#applyCached(w.i, w.state, key, w.transform, cached);
      sample ??= s;
    }
    this.#absorb(r.run);
    this.#set({ pending, run: r.run, sample: sample ?? this.#state.sample, lastError: null, cache: { ...this.#state.cache, waited: this.#state.cache.waited + still.length, situations: this.cache.size } });
  }
}

// The overseer's look: two PNGs, a box and a noul, through the same proxy and
// ledger as the ants. The box steers only when it is specific (under half the
// picture) and sits on ink the target actually asks for.
const OVERSEER_MAX_AREA = 0.5;
const OVERSEER_MIN_INK = 0.05;

export function boxSteers(box: Box, target: Float32Array, size: { w: number; h: number }): boolean {
  return boxArea(box) <= OVERSEER_MAX_AREA && boxInkShare(box, target, size) >= OVERSEER_MIN_INK;
}

function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === "AbortError";
}

function compassOf(h: number): string {
  const names = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];
  const k = Math.round((((h % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  return names[k] as string;
}
