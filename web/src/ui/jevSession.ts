import { AIMS, DOCTRINES } from "../colony/index.ts";
import type { Budget } from "../../shared/jev.ts";
import type { Backend } from "./backend.ts";
import type { ColonyJev } from "./colonyJev.ts";
import { COLONY_NAMES } from "./names.ts";
import { canResume, policyLock, shouldStart } from "./policyLock.ts";

// The page's side of the colonies' Jev client (ja-fnd.6.1, docs/refactor.md S5.1): one object that holds what the page keeps about Jev and decides, in one
// place and synchronously, whether Jev can run (policyLock), whether a miss may start a run (shouldStart), and whether new words are taken. It owns what
// useColonyJev used to keep in React state and effects: the backend (what /api/health said), whether a start is on the wire, each colony's doctrine and
// the fungus's aim. React reads it with useSyncExternalStore over `subscribe` and `snapshot`; a Node test runs all of it.
//
// What is asked of Jev, and when, is the client's (colonyJev.ts) and unchanged: this tells it `canAsk` and `wantsRun`. The lock is computed where it is
// needed, not in an effect after a render, so an edit never meets a lock one commit old; `canAsk` and the start flag follow every change at once.

export interface DoctrineChoice {
  /** a preset's id, or "custom" */
  id: string;
  text: string;
}

/** Every colony starts foraging: one doctrine, one shared cache, no extra spend. */
export const FIRST_DOCTRINES: DoctrineChoice[] = COLONY_NAMES.map(() => ({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text }));

/** What the page draws from: small values, rebuilt only when one changes, so a reader draws again when what it reads does. */
export interface JevSnapshot {
  phase: "off" | "running" | "stopped";
  /** why no policy can change now (policyLock), or null */
  lock: string | null;
  /** the player can start Jev by hand (Lab → Jev → Resume) */
  resumable: boolean;
  doctrines: readonly DoctrineChoice[];
  aim: DoctrineChoice;
  /** the daily budget the page loaded with (today's spend is the last run's figure when there is one) */
  backendBudget: Budget | null;
}

/** The slice of the client the session drives (a test gives a fake). */
export type JevClient = Pick<
  ColonyJev,
  | "state"
  | "canAsk"
  | "wantsRun"
  | "subscribe"
  | "start"
  | "stop"
  | "setDoctrineFor"
  | "setAim"
  | "explain"
  | "explainFungus"
  | "fungusAnswers"
>;

export class JevSession {
  readonly client: JevClient;
  #backend: Backend | null = null;
  #starting = false;
  #doctrines: DoctrineChoice[] = FIRST_DOCTRINES;
  #aim: DoctrineChoice = { id: AIMS[0]!.id, text: AIMS[0]!.text };
  /** whether a miss may start a run now: read by the client's `wantsRun` on every miss, from the game's tick */
  #startable = false;
  #snap: JevSnapshot;
  readonly #listeners = new Set<() => void>();

  constructor(client: JevClient) {
    this.client = client;
    this.#snap = this.#build();
    this.#apply();
  }

  /** React's pair: `subscribe` to be told of a change, `snapshot` for the current values (the same object until one changes). */
  readonly subscribe = (fn: () => void): (() => void) => {
    this.#listeners.add(fn);
    return () => void this.#listeners.delete(fn);
  };
  readonly snapshot = (): JevSnapshot => this.#snap;

  /** Why no policy can change now, worked out from what is true now. */
  get lock(): string | null {
    return policyLock(this.#backend, this.client.state, this.#starting);
  }

  /**
   * Begin following the client: its state ticks, and the page's start by a miss. Returns the end. Called from an effect (so StrictMode's second
   * mount follows again after the first one's end).
   */
  open(): () => void {
    const off = this.client.subscribe(() => this.#sync());
    this.client.wantsRun = () => {
      if (!this.#startable) return;
      // At once, before the start itself (a microtask later): nothing between can start a second run.
      this.#startable = false;
      this.#setStarting(true);
      queueMicrotask(() => this.#run());
    };
    this.#sync();
    return () => {
      off();
      this.client.wantsRun = null;
    };
  }

  /** What /api/health said (null while it is being asked). */
  setBackend(b: Backend | null): void {
    this.#backend = b;
    this.#sync();
  }

  /** Start Jev by hand (Lab → Jev → Resume). */
  start = (): void => {
    this.#setStarting(true);
    this.#run();
  };

  stop = (): void => {
    void this.client.stop();
  };

  /** How a colony's ant decided, for the ant card (the client's explain). */
  explain: JevClient["explain"] = (s, k) => this.client.explain(s, k);
  /** How the fungus decided, for the ant card. */
  explainFungus: JevClient["explainFungus"] = (s) => this.client.explainFungus(s);
  /** The fungus's answers so far (the Policy tab's table). */
  fungusAnswers: JevClient["fungusAnswers"] = () => this.client.fungusAnswers();

  /** The words a colony starts with, and the first aim: given to the client, not a change the player made. */
  initWords(): void {
    FIRST_DOCTRINES.forEach((d, k) => this.client.setDoctrineFor(k, d.text));
    this.client.setAim(AIMS[0]!.text);
  }

  /** A draft of colony k's words (typing): the page's, not yet the client's. */
  draftDoctrine = (k: number, d: DoctrineChoice): void => {
    this.#doctrines = this.#doctrines.map((x, j) => (j === k ? d : x));
    this.#sync();
  };

  /** Colony k's words taken: not while Jev can't read them (a lock). */
  setDoctrine = (k: number, d: DoctrineChoice): void => {
    if (this.lock !== null) return;
    this.draftDoctrine(k, d);
    this.client.setDoctrineFor(k, d.text);
  };

  /**
   * A daughter colony k's words as she founds (ja-lo8.9): the player's, from the queen's pen (which opens only while Jev can read them), or her
   * mother's (no pen: not a change of policy, so not held back by the lock; the mother's answers are cached under the same words).
   */
  foundWith = (k: number, d: DoctrineChoice): void => {
    this.draftDoctrine(k, { ...d });
    this.client.setDoctrineFor(k, d.text);
  };

  /** A draft of the fungus's aim (typing). */
  draftAim = (a: DoctrineChoice): void => {
    this.#aim = a;
    this.#sync();
  };

  /** The fungus's aim taken: not while Jev can't read it. A player's change: Jev asks what the new aim lacks at once (ja-lo8.21). */
  setAim = (a: DoctrineChoice): void => {
    if (this.lock !== null) return;
    this.draftAim(a);
    this.client.setAim(a.text, { askNow: true });
  };

  /**
   * A saved game's words back (ui/saves.ts): its aim and each colony's doctrine. Not a change of policy, so not held back by the lock: the
   * answers under those words are cached, and what is not is asked as it comes up.
   */
  restore = (a: DoctrineChoice, ds: DoctrineChoice[]): void => {
    this.#aim = a;
    this.client.setAim(a.text);
    this.#doctrines = ds.map((d) => ({ ...d }));
    ds.forEach((d, k) => this.client.setDoctrineFor(k, d.text));
    this.#sync();
  };

  #setStarting(v: boolean): void {
    this.#starting = v;
    this.#sync();
  }

  #run(): void {
    void this.client.start().finally(() => this.#setStarting(false));
  }

  /** The client's `canAsk` and the start flag, from what is true now; then the snapshot, told only if a value in it changed. */
  #apply(): void {
    const s = this.client.state;
    this.client.canAsk = policyLock(this.#backend, s, this.#starting) === null;
    this.#startable = shouldStart(this.#backend, s, this.#starting);
  }

  #sync(): void {
    this.#apply();
    const next = this.#build();
    const p = this.#snap;
    if (
      next.phase === p.phase &&
      next.lock === p.lock &&
      next.resumable === p.resumable &&
      next.doctrines === p.doctrines &&
      next.aim === p.aim &&
      next.backendBudget === p.backendBudget
    )
      return;
    this.#snap = next;
    for (const fn of this.#listeners) fn();
  }

  #build(): JevSnapshot {
    const s = this.client.state;
    return {
      phase: s.phase,
      lock: policyLock(this.#backend, s, this.#starting),
      resumable: canResume(this.#backend, s, this.#starting),
      doctrines: this.#doctrines,
      aim: this.#aim,
      backendBudget: this.#backend?.budget ?? null,
    };
  }
}
