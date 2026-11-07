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
// Jev is always on (the fungus game, ja-lo8.2): the run starts as soon as the server and its key are there, and starts
// again after a time cap. While it can't run, `lock` says why, and the page's policy editors are disabled: the game
// plays on the answers already cached (policyLock.ts).

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
      // Leaving the page: end the run on the server rather than leaving it open until its time cap
      // (answers are already saved as they arrive).
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
  useEffect(() => jev.attachColonies(colonies), [jev, colonies]);
  // The fungus spans the game: the lane drives each new game's, under the player's menu.
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);
  useEffect(() => jev.setMenu(new Set(menu)), [jev, menu]);

  const draftDoctrine = useCallback((k: number, d: DoctrineChoice) => setDoctrinesState((all) => all.map((x, j) => (j === k ? d : x))), []);
  const setDoctrine = useCallback(
    (k: number, d: DoctrineChoice) => {
      if (lockRef.current !== null) return;
      draftDoctrine(k, d);
      jev.setDoctrineFor(k, d.text);
    },
    [jev, draftDoctrine],
  );
  // The page's own start: once when the server and key are there, again after a time cap (shouldStart).
  const [starting, setStarting] = useState(false);
  const startedOnce = useRef(false);
  const start = useCallback(() => {
    startedOnce.current = true;
    setStarting(true);
    void jev.start().finally(() => setStarting(false));
  }, [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);
  useEffect(() => {
    if (shouldStart(backend, state, startedOnce.current, starting)) start();
  }, [backend, state, starting, start]);
  const lock = policyLock(backend, state, starting);
  useEffect(() => {
    lockRef.current = lock;
  }, [lock]);
  const resumable = canResume(backend, state, starting);

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

  return { state, start, stop, lock, resumable, doctrines, setDoctrine, draftDoctrine, explain, aim, setAim, draftAim: setAimState, explainFungus };
}
