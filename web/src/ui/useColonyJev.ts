import { useCallback, useEffect, useMemo, useState } from "react";
import type { Colony, Situation } from "../colony/colony.ts";
import { DOCTRINES, estimateTokens, packModeRequest } from "../colony/colonyBrain.ts";
import type { FungalSituation } from "../colony/fungalPolicy.ts";
import { AIMS, packFungusRequest } from "../colony/fungusBrain.ts";
import { INTERVENTIONS, type Fungus } from "../colony/fungus.ts";
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
      return Array.isArray(entries) ? entries.filter((e): e is [string, string] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string") : [];
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
const SAMPLE: Situation = { mode: "explore", tired: false, foodTrail: "faint", homeTrail: "strong", alarm: "none", enemy: "none", stance: "forage" };
export const TOKENS_PER_SITUATION = Math.round(estimateTokens(packModeRequest(Array.from({ length: 100 }, (_, n) => ({ id: `s${n}`, situation: SAMPLE })), DOCTRINES[0]!.text)) / 100);

/** The same for a fungal situation (legend + aim dominate, as for the ants). */
const FUNGAL_SAMPLE: FungalSituation = { strain: "garden", load: "mid", host: "explore", ground: "border", contact: "kin", groomed: false };
export const TOKENS_PER_FUNGAL_SITUATION = Math.round(
  estimateTokens(packFungusRequest(Array.from({ length: 100 }, (_, n) => ({ id: `h${n}`, situation: FUNGAL_SAMPLE })), AIMS[0]!.text, new Set(INTERVENTIONS.map((v) => v.id)))) / 100,
);

export interface DoctrineChoice {
  /** a preset's id, or "custom" */
  id: string;
  text: string;
}

export function useColonyJev(colony: Colony, fungus: Fungus, menu: readonly string[]) {
  const jev = useMemo(() => new ColonyJev({}, localStore), []);
  const [state, setState] = useState<ColonyJevState>(jev.state);
  const [doctrine, setDoctrineState] = useState<DoctrineChoice>({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text });
  const [aim, setAimState] = useState<DoctrineChoice>({ id: AIMS[0]!.id, text: AIMS[0]!.text });

  useEffect(() => {
    const off = jev.subscribe(setState);
    jev.setDoctrine(DOCTRINES[0]!.text);
    jev.setAim(AIMS[0]!.text);
    return () => {
      off();
      // Leaving the page: end the run on the server rather than leaving it open until its time cap
      // (answers are already saved as they arrive).
      if (jev.state.phase === "running") void jev.stop();
      jev.dispose();
    };
  }, [jev]);
  useEffect(() => jev.attach(colony), [jev, colony]);
  // The fungus spans the game: the lane drives each new game's, under the player's menu.
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);
  useEffect(() => jev.setMenu(new Set(menu)), [jev, menu]);

  const setDoctrine = useCallback(
    (d: DoctrineChoice) => {
      setDoctrineState(d);
      jev.setDoctrine(d.text);
    },
    [jev],
  );
  const start = useCallback(() => void jev.start(), [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);

  const explain = useCallback((s: Situation) => jev.explain(s), [jev]);
  const explainFungus = useCallback((s: FungalSituation) => jev.explainFungus(s), [jev]);
  const setAim = useCallback(
    (a: DoctrineChoice) => {
      setAimState(a);
      jev.setAim(a.text);
    },
    [jev],
  );

  return { state, start, stop, doctrine, setDoctrine, draftDoctrine: setDoctrineState, explain, aim, setAim, draftAim: setAimState, explainFungus };
}
