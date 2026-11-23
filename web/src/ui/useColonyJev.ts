import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { SPECIES, type Colony, DOCTRINES, AIMS, type Fungus, type Journal, GENERIC_ANT, type Species } from "../colony/index.ts";
import { browserCache } from "./cacheStore.ts";
import { ColonyJev, PAGE_ASKS_RESPONSE_LANES, type ColonyJevState } from "./colonyJev.ts";
import { tokensPerQuestion } from "./prompt.ts";
import type { Backend } from "./backend.ts";
import { type DoctrineChoice, JevSession } from "./jevSession.ts";
import { loadPrecache } from "./precache.ts";

// React face of the colonies' Jev client: one client for the page's life
// (the colonies change with the world, the caches do not) and the session over it
// (jevSession.ts), which keeps the lock, whether a miss may start a run, each colony's doctrine (its nature: a scenario
// setting, not the player's lever) and the fungus's aim (the player's). Cached answers live in localStorage under their
// context (cacheStore.ts).
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

export type { DoctrineChoice };

/** The client's whole state, drawn again on every change of it (the Lab's Jev card: its counters tick with each batch). */
export function useJevState(client: { state: ColonyJevState; subscribe: ColonyJev["subscribe"] }): ColonyJevState {
  const subscribe = useCallback((fn: () => void) => client.subscribe(fn), [client]);
  return useSyncExternalStore(subscribe, () => client.state);
}

/**
 * The page's Jev session, built once and given its lifecycle (the backend it is told, its words, the precache, the colonies and the fungus it drives).
 * It does not subscribe: the page reads the session through ui/jevContext.tsx (`useJev(select)`), so a change of the lock or the aim draws only
 * the readers of it. Called once, in ColonyApp, which provides the session to the page.
 */
export function useColonyJev(
  colonies: readonly Colony[],
  fungus: Fungus,
  backend: Backend | null = null,
  journal: Journal | null = null,
  species: Species = GENERIC_ANT,
): JevSession {
  // One session for the page's life (ui/jevSession.ts): it keeps what the page holds about Jev and decides, synchronously, the lock and whether a
  // miss may start a run. This hook is its React face: it feeds it the backend and runs its lifecycle.
  const session = useMemo(() => new JevSession(new ColonyJev({}, browserCache)), []);
  const jev = session.client as ColonyJev;
  jev.journal = journal;
  useEffect(() => session.setBackend(backend), [session, backend]);

  useEffect(() => {
    const close = session.open();
    session.initWords();
    // Answers are written to the store a second after the last reply: a tab hidden or closed in that second writes them now.
    const flush = () => jev.flushCache();
    const hidden = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", flush);
    return () => {
      close();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", flush);
      // Leaving the page: end the run on the server (stop and dispose write what the replies brought).
      if (jev.state.phase === "running") void jev.stop();
      jev.dispose();
    };
  }, [session, jev]);
  // Jev's answers shipped with the page (ui/precache.ts), under any this browser already has.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return; // once per page: StrictMode runs effects twice
    seeded.current = true;
    // Each bundle against its own species' words (ja-fnd.5.15); one this build doesn't know is skipped.
    void loadPrecache((context, entries, id) => {
      const sp = id === undefined ? GENERIC_ANT : SPECIES[id];
      return sp ? jev.seed(context, entries, sp) : 0;
    });
  }, [jev]);
  // A colony founded mid-game is pushed onto the same array (Game.addColony): its length drives a re-attach too.
  const count = colonies.length;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => jev.attachColonies(colonies, species, PAGE_ASKS_RESPONSE_LANES), [jev, colonies, count, species]);
  // The fungus spans the game: the lane drives each new game's, under the menu the fungus holds (useColony configures it).
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);

  return session;
}
