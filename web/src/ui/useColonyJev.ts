import { useCallback, useEffect, useMemo, useState } from "react";
import type { Colony, Situation } from "../colony/colony.ts";
import { COLONY_NAMES } from "./names.ts";
import { DOCTRINES } from "../colony/colonyBrain.ts";
import type { FungalSituation } from "../colony/fungalPolicy.ts";
import { AIMS } from "../colony/fungusBrain.ts";
import type { Fungus } from "../colony/fungus.ts";
import { browserCache } from "./cacheStore.ts";
import { ColonyJev, DEFAULT_LEGENDS, type ColonyJevState, type LaneName } from "./colonyJev.ts";
import { tokensPerQuestion } from "./prompt.ts";

// React face of the colonies' Jev client: one client for the page's life
// (the colonies change with the world, the caches do not), its state mirrored
// into React, each colony's doctrine (its nature: a scenario setting, not the
// player's lever) and the fungus's aim (the player's). Cached answers live in
// localStorage under their context (cacheStore.ts).

/** Estimated input tokens per situation at the default legend, from the size of a full request (the ledger counts the real ones). */
export const TOKENS_PER_SITUATION = tokensPerQuestion("mode", DOCTRINES[0]!.text, DEFAULT_LEGENDS.mode);

/** The same for a fungal situation (legend + aim dominate, as for the ants). */
export const TOKENS_PER_FUNGAL_SITUATION = tokensPerQuestion("fungus", AIMS[0]!.text, DEFAULT_LEGENDS.fungus);

export interface DoctrineChoice {
  /** a preset's id, or "custom" */
  id: string;
  text: string;
}

/** Every colony starts foraging: one doctrine, one shared cache, no extra spend. */
const FIRST_DOCTRINES: DoctrineChoice[] = COLONY_NAMES.map(() => ({ id: DOCTRINES[0]!.id, text: DOCTRINES[0]!.text }));

export function useColonyJev(colonies: readonly Colony[], fungus: Fungus, menu: readonly string[]) {
  const jev = useMemo(() => new ColonyJev({}, browserCache), []);
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

  // The legends each lane asks under: the defaults, or the player's edits (the Learn drawer). Kept for the page's life, like the doctrines.
  const [legends, setLegendsState] = useState<Record<LaneName, string>>({ ...DEFAULT_LEGENDS });
  const setLegend = useCallback(
    (name: LaneName, text: string | null) => {
      jev.setLegend(name, text);
      setLegendsState((all) => ({ ...all, [name]: jev.legend(name) }));
    },
    [jev],
  );

  return { state, start, stop, doctrines, setDoctrine, draftDoctrine, explain, aim, setAim, draftAim: setAimState, explainFungus, legends, setLegend };
}
