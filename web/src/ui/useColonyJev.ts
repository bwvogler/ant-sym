import { useCallback, useEffect, useMemo, useState } from "react";
import type { Colony, Mode, Situation } from "../colony/colony.ts";
import { DOCTRINES, estimateTokens, packModeRequest } from "../colony/colonyBrain.ts";
import { ColonyJev, type CacheStore, type ColonyJevState } from "./colonyJev.ts";

// React face of the colony's Jev client: one client for the page's life
// (the colony changes with the world, the cache does not), its state
// mirrored into React, and the doctrine the player picks or writes.
// Cached answers live in localStorage under their doctrine's context.

const STORE_PREFIX = "jev-ants:colony-policy:";

const localStore: CacheStore = {
  load(context) {
    try {
      const raw = localStorage.getItem(STORE_PREFIX + context);
      const entries = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(entries) ? entries.filter((e): e is [string, Mode] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string") : [];
    } catch {
      return []; // storage blocked or unreadable: start cold
    }
  },
  save(context, entries) {
    try {
      localStorage.setItem(STORE_PREFIX + context, JSON.stringify(entries));
    } catch {
      // storage blocked or full: the cache still lives for this page load
    }
  },
};

/** Estimated input tokens per situation, from the size of a full request (the ledger counts the real ones). */
const SAMPLE: Situation = { mode: "explore", tired: false, foodTrail: "faint", homeTrail: "strong", alarm: "none" };
export const TOKENS_PER_SITUATION = Math.round(estimateTokens(packModeRequest(Array.from({ length: 100 }, (_, n) => ({ id: `s${n}`, situation: SAMPLE })), DOCTRINES[0]!.text)) / 100);

export interface DoctrineChoice {
  /** a preset's id, or "custom" */
  id: string;
  text: string;
}

export function useColonyJev(colony: Colony) {
  const jev = useMemo(() => new ColonyJev({}, localStore), []);
  const [state, setState] = useState<ColonyJevState>(jev.state);
  const [doctrine, setDoctrineState] = useState<DoctrineChoice>({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text });

  useEffect(() => {
    const off = jev.subscribe(setState);
    jev.setDoctrine(DOCTRINES[0]!.text);
    return () => {
      off();
      // Leaving the page: end the run on the server rather than leaving it open until its time cap
      // (answers are already saved as they arrive).
      if (jev.state.phase === "running") void jev.stop();
      jev.dispose();
    };
  }, [jev]);
  useEffect(() => jev.attach(colony), [jev, colony]);

  const setDoctrine = useCallback(
    (d: DoctrineChoice) => {
      setDoctrineState(d);
      jev.setDoctrine(d.text);
    },
    [jev],
  );
  const start = useCallback(() => void jev.start(), [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);

  return { state, start, stop, doctrine, setDoctrine, draftDoctrine: setDoctrineState };
}
