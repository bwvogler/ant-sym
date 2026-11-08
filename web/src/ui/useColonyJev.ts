import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Colony, Situation } from "../colony/colony.ts";
import { COLONY_NAMES } from "./names.ts";
import { DOCTRINES } from "../colony/colonyBrain.ts";
import type { FungalSituation } from "../colony/fungalPolicy.ts";
import { AIMS } from "../colony/fungusBrain.ts";
import type { Fungus } from "../colony/fungus.ts";
import { browserCache } from "./cacheStore.ts";
import { ColonyJev, type ColonyJevState } from "./colonyJev.ts";
import { tokensPerQuestion } from "./prompt.ts";
import type { Backend } from "./backend.ts";
import { canResume, policyLock, shouldStart } from "./policyLock.ts";
import { loadPrecache } from "./precache.ts";

// React face of the colonies' Jev client: one client for the page's life
// (the colonies change with the world, the caches do not), its state mirrored
// into React, each colony's doctrine (its nature: a scenario setting, not the
// player's lever) and the fungus's aim (the player's). Cached answers live in
// localStorage under their context (cacheStore.ts).
//
// Jev in the fungus game (ja-lo8.2; PR #42 review S6–S8): spend nothing while answers are cached, and ask Jev only for
// the situations that aren't. The page plays the answers it ships and those Jev gave before; a situation with no answer
// under the current words (preset or the player's own) plays the local rule while it is asked, and starts a run
// (ColonyJev.wantsRun), which stays open until the page closes, under the server's overall daily budget. While Jev can't
// run, `lock` says why, the page's policy editors are disabled (policyLock.ts), and answers under earlier words play
// where the current ones have none (ColonyJev.canAsk, ja-lo8.15).

/** Estimated input tokens per situation, from the size of a full request (the ledger counts the real ones). */
export const TOKENS_PER_SITUATION = tokensPerQuestion("mode", DOCTRINES[0]!.text);

/** The same for a fungal situation (legend + aim dominate, as for the ants). */
export const TOKENS_PER_FUNGAL_SITUATION = tokensPerQuestion("fungus", AIMS[0]!.text);

export interface DoctrineChoice {
  /** a preset's id, or "custom" */
  id: string;
  text: string;
}

/** Every colony starts foraging: one doctrine, one shared cache, no extra spend. */
const FIRST_DOCTRINES: DoctrineChoice[] = COLONY_NAMES.map(() => ({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text }));

export function useColonyJev(colonies: readonly Colony[], fungus: Fungus, menu: readonly string[], backend: Backend | null = null) {
  const jev = useMemo(() => new ColonyJev({}, browserCache), []);
  const [state, setState] = useState<ColonyJevState>(jev.state);
  const [doctrines, setDoctrinesState] = useState<DoctrineChoice[]>(FIRST_DOCTRINES);
  const [aim, setAimState] = useState<DoctrineChoice>({ id: AIMS[0]!.id, text: AIMS[0]!.text });
  /** Why no policy can change now (policyLock), read by the setters: words Jev can't read are not taken. */
  const lockRef = useRef<string | null>(null);

  useEffect(() => {
    const off = jev.subscribe(setState);
    FIRST_DOCTRINES.forEach((d, k) => jev.setDoctrineFor(k, d.text));
    jev.setAim(AIMS[0]!.text);
    return () => {
      off();
      // Leaving the page: end the run on the server (answers are already saved as they arrive).
      if (jev.state.phase === "running") void jev.stop();
      jev.dispose();
    };
  }, [jev]);
  // Jev's answers shipped with the page (ui/precache.ts), under any this browser already has.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return; // once per page: StrictMode runs effects twice
    seeded.current = true;
    void loadPrecache((context, entries) => jev.seed(context, entries));
  }, [jev]);
  // A colony founded mid-game is pushed onto the same array (Game.addColony): its length drives a re-attach too.
  const count = colonies.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => jev.attachColonies(colonies), [jev, colonies, count]);
  // The fungus spans the game: the lane drives each new game's, under the player's menu.
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);
  useEffect(() => jev.setMenu(new Set(menu)), [jev, menu]);

  // A run starts at the first miss where Jev can run (shouldStart), or by hand (Details → Resume).
  const [starting, setStarting] = useState(false);
  const start = useCallback(() => {
    setStarting(true);
    void jev.start().finally(() => setStarting(false));
  }, [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);
  const lock = policyLock(backend, state, starting);
  /** Whether a miss should start a run now, read on every miss (so a ref, not state). */
  const startRef = useRef(false);
  useEffect(() => {
    lockRef.current = lock;
    startRef.current = shouldStart(backend, state, starting);
    // While Jev can answer, a miss plays the local rule until the answer comes; earlier words' answers only while it can't (ja-lo8.15).
    jev.canAsk = lock === null;
  }, [jev, lock, backend, state, starting]);
  const resumable = canResume(backend, state, starting);
  // A situation with no answer under the current words, and no run on: start one (S7). Called on every such miss, from
  // the game's tick, so it only checks a ref, and starts after the tick.
  useEffect(() => {
    jev.wantsRun = () => {
      if (!startRef.current) return;
      startRef.current = false;
      queueMicrotask(start);
    };
    return () => {
      jev.wantsRun = null;
    };
  }, [jev, start]);

  const draftDoctrine = useCallback((k: number, d: DoctrineChoice) => setDoctrinesState((all) => all.map((x, j) => (j === k ? d : x))), []);
  const setDoctrine = useCallback(
    (k: number, d: DoctrineChoice) => {
      if (lockRef.current !== null) return;
      draftDoctrine(k, d);
      jev.setDoctrineFor(k, d.text);
    },
    [jev, draftDoctrine],
  );

  /**
   * A daughter colony k's words as she founds (ja-lo8.9): the player's, from the queen's pen (which opens only while
   * Jev can read them), or her mother's (no pen: not a change of policy, so not held back by the lock; the mother's
   * answers are cached under the same words).
   */
  const foundWith = useCallback(
    (k: number, d: DoctrineChoice) => {
      draftDoctrine(k, { ...d });
      jev.setDoctrineFor(k, d.text);
    },
    [jev, draftDoctrine],
  );

  const explain = useCallback((s: Situation, k: number) => jev.explain(s, k), [jev]);
  const explainFungus = useCallback((s: FungalSituation) => jev.explainFungus(s), [jev]);
  const setAim = useCallback(
    (a: DoctrineChoice) => {
      if (lockRef.current !== null) return;
      setAimState(a);
      jev.setAim(a.text);
    },
    [jev],
  );

  const fungusAnswers = useCallback(() => jev.fungusAnswers(), [jev]);
  /**
   * A saved game's words back (ui/saves.ts): its aim and each colony's doctrine. Not a change of policy, so not held
   * back by the lock: the answers under those words are cached, and what is not is asked as it comes up.
   */
  const restore = useCallback(
    (a: DoctrineChoice, ds: DoctrineChoice[]) => {
      setAimState(a);
      jev.setAim(a.text);
      setDoctrinesState(ds.map((d) => ({ ...d })));
      ds.forEach((d, k) => jev.setDoctrineFor(k, d.text));
    },
    [jev],
  );

  /** today's spend against the server's daily budget: the last run's figure, else the one the page loaded with */
  const budget = state.run?.budget ?? backend?.budget ?? null;

  return { state, budget, start, stop, lock, resumable, fungusAnswers, restore, doctrines, setDoctrine, draftDoctrine, foundWith, explain, aim, setAim, draftAim: setAimState, explainFungus };
}
