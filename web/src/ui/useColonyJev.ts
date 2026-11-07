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
// Jev in the fungus game (ja-lo8.2; PR #42 review S6): the page plays the answers it ships and those Jev gave before,
// and asks Jev only when the player changes a policy: a new aim or doctrine starts a run, which asks the situations
// with no answer under the player's own words (never a preset's: they ship) and ends at its time cap. While Jev can't
// run, `lock` says why, and the page's policy editors are disabled (policyLock.ts).

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

/** The preset words, whose answers ship with the page (ui/precache.ts): never asked (ColonyJevOptions.shipped). */
const SHIPPED: ReadonlySet<string> = new Set([...DOCTRINES.map((d) => d.text), ...AIMS.map((a) => a.text)]);

export function useColonyJev(colonies: readonly Colony[], fungus: Fungus, menu: readonly string[], backend: Backend | null = null) {
  const jev = useMemo(() => new ColonyJev({ shipped: SHIPPED }, browserCache), []);
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
  // A colony founded mid-game is pushed onto the same array (Game.addColony): its length drives a re-attach too.
  const count = colonies.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => jev.attachColonies(colonies), [jev, colonies, count]);
  // The fungus spans the game: the lane drives each new game's, under the player's menu.
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);
  useEffect(() => jev.setMenu(new Set(menu)), [jev, menu]);

  // A run starts with a change of words (shouldStart), or by hand (Details → Resume): never by itself.
  const [starting, setStarting] = useState(false);
  const start = useCallback(() => {
    setStarting(true);
    void jev.start().finally(() => setStarting(false));
  }, [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);
  const lock = policyLock(backend, state, starting);
  /** Whether a change of words should start a run now, read by the setters. */
  const startRef = useRef(false);
  useEffect(() => {
    lockRef.current = lock;
    startRef.current = shouldStart(backend, state, starting);
  }, [lock, backend, state, starting]);
  const resumable = canResume(backend, state, starting);
  /** New words from the player: asked from now on, so a run starts if none is on. */
  const changed = useCallback(() => {
    if (!startRef.current) return;
    startRef.current = false;
    start();
  }, [start]);

  const draftDoctrine = useCallback((k: number, d: DoctrineChoice) => setDoctrinesState((all) => all.map((x, j) => (j === k ? d : x))), []);
  const setDoctrine = useCallback(
    (k: number, d: DoctrineChoice) => {
      if (lockRef.current !== null) return;
      draftDoctrine(k, d);
      jev.setDoctrineFor(k, d.text);
      if (!SHIPPED.has(d.text)) changed();
    },
    [jev, draftDoctrine, changed],
  );

  const explain = useCallback((s: Situation, k: number) => jev.explain(s, k), [jev]);
  const explainFungus = useCallback((s: FungalSituation) => jev.explainFungus(s), [jev]);
  const setAim = useCallback(
    (a: DoctrineChoice) => {
      if (lockRef.current !== null) return;
      setAimState(a);
      jev.setAim(a.text);
      if (!SHIPPED.has(a.text)) changed();
    },
    [jev, changed],
  );

  const fungusAnswers = useCallback(() => jev.fungusAnswers(), [jev]);
  /**
   * A saved game's words back (ui/saves.ts): its aim and each colony's doctrine. Not a change of policy, so not held
   * back by the lock: the answers under those words are cached, and words of the player's own start a run where one
   * could, to ask what is left.
   */
  const restore = useCallback(
    (a: DoctrineChoice, ds: DoctrineChoice[]) => {
      setAimState(a);
      jev.setAim(a.text);
      setDoctrinesState(ds.map((d) => ({ ...d })));
      ds.forEach((d, k) => jev.setDoctrineFor(k, d.text));
      if (!SHIPPED.has(a.text) || ds.some((d) => !SHIPPED.has(d.text))) changed();
    },
    [jev, changed],
  );

  return { state, start, stop, lock, resumable, fungusAnswers, restore, doctrines, setDoctrine, draftDoctrine, explain, aim, setAim, draftAim: setAimState, explainFungus };
}
