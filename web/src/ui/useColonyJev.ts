import { useCallback, useEffect, useMemo, useState } from "react";
import type { Colony, Situation } from "../colony/colony.ts";
import { COLONY_NAMES } from "./names.ts";
import { DOCTRINES, estimateTokens, packModeRequest } from "../colony/colonyBrain.ts";
import type { FungalSituation } from "../colony/fungalPolicy.ts";
import { AIMS, packFungusRequest } from "../colony/fungusBrain.ts";
import { INTERVENTIONS, type Fungus } from "../colony/fungus.ts";
import { ColonyJev, type CacheStore, type ColonyJevState } from "./colonyJev.ts";

// React face of the colonies' Jev client: one client for the page's life
// (the colonies change with the world, the caches do not), its state mirrored
// into React, each colony's doctrine (its nature: a scenario setting, not the
// player's lever) and the fungus's aim (the player's). Cached answers live in
// localStorage under their context.

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

/** Every colony starts foraging: one doctrine, one shared cache, no extra spend. */
const FIRST_DOCTRINES: DoctrineChoice[] = COLONY_NAMES.map(() => ({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text }));

export function useColonyJev(colonies: readonly Colony[], fungus: Fungus, menu: readonly string[]) {
  const jev = useMemo(() => new ColonyJev({}, localStore), []);
  const [state, setState] = useState<ColonyJevState>(jev.state);
  const [doctrines, setDoctrinesState] = useState<DoctrineChoice[]>(FIRST_DOCTRINES);
  const [aim, setAimState] = useState<DoctrineChoice>({ id: AIMS[0]!.id, text: AIMS[0]!.text });

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
  useEffect(() => jev.attachColonies(colonies), [jev, colonies]);
  // The fungus spans the game: the lane drives each new game's, under the player's menu.
  useEffect(() => jev.attachFungus(fungus), [jev, fungus]);
  useEffect(() => jev.setMenu(new Set(menu)), [jev, menu]);

  const draftDoctrine = useCallback((k: number, d: DoctrineChoice) => setDoctrinesState((all) => all.map((x, j) => (j === k ? d : x))), []);
  const setDoctrine = useCallback(
    (k: number, d: DoctrineChoice) => {
      draftDoctrine(k, d);
      jev.setDoctrineFor(k, d.text);
    },
    [jev, draftDoctrine],
  );
  const start = useCallback(() => void jev.start(), [jev]);
  const stop = useCallback(() => void jev.stop(), [jev]);

  const explain = useCallback((s: Situation, k: number) => jev.explain(s, k), [jev]);
  const explainFungus = useCallback((s: FungalSituation) => jev.explainFungus(s), [jev]);
  const setAim = useCallback(
    (a: DoctrineChoice) => {
      setAimState(a);
      jev.setAim(a.text);
    },
    [jev],
  );

  return { state, start, stop, doctrines, setDoctrine, draftDoctrine, explain, aim, setAim, draftAim: setAimState, explainFungus };
}
