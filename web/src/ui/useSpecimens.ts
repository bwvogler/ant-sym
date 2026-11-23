import { useCallback, useEffect, useMemo, useState } from "react";
import type { Game } from "../colony/index.ts";
import type { Followed } from "./follow.ts";
import { colonyName } from "./names.ts";
import { living, pin, sameAnt, type Specimen, specimenLabel, unpin } from "./specimens.ts";
import { pushToast } from "./toasts.ts";

// The pinned specimens (PRD §69.5; ja-fnd.6.2, docs/refactor.md S5.2): up to three ants kept for the inspector to compare, as the page holds them. They
// belong to their game, like the follow: a new game has new ants, so the list is empty. (What a specimen is and the pin and unpin rules are specimens.ts's.)

export function useSpecimens(
  game: Game,
  gameToken: object,
): { specimens: Specimen[]; setSpecimens: (list: Specimen[]) => void; togglePin: (f: Followed) => void } {
  const [pinned, setPinned] = useState<{ token: object; list: Specimen[] }>({ token: gameToken, list: [] });
  const specimens = useMemo(() => (pinned.token === gameToken ? pinned.list : []), [pinned, gameToken]);
  const setSpecimens = useCallback((list: Specimen[]) => setPinned({ token: gameToken, list }), [gameToken]);
  /** Pin the followed ant as a specimen, or unpin it; a fourth replaces the oldest, and a notice says so. */
  const togglePin = useCallback(
    (f: Followed) => {
      if (specimens.some((s) => sameAnt(s, f))) return setSpecimens(unpin(specimens, f));
      // The living ones only: one that died within the second the watch waits doesn't count toward the three (review of #218).
      // It is said here: the watch won't see it again.
      const { kept, gone } = living(specimens, game.colonies);
      for (const g of gone)
        pushToast(`${specimenLabel(g.no)}, ant #${g.i} of ${colonyName(g.k)}, has died: it leaves your specimens.`, "info", {
          group: "specimen-died",
        });
      const r = pin(kept, f);
      setSpecimens(r.list);
      if (r.dropped)
        pushToast(
          `Three specimens at most: ${specimenLabel(r.dropped.no)}, ant #${r.dropped.i} of ${colonyName(r.dropped.k)}, is unpinned.`,
          "info",
        );
    },
    [specimens, setSpecimens, game],
  );
  // A specimen that dies leaves the list, with a notice (checked once a second: the rows show nothing once it is gone).
  useEffect(() => {
    if (!specimens.length) return;
    const t = setInterval(() => {
      const { kept, gone } = living(specimens, game.colonies);
      if (!gone.length) return;
      setSpecimens(kept);
      for (const f of gone)
        pushToast(`${specimenLabel(f.no)}, ant #${f.i} of ${colonyName(f.k)}, has died: it leaves your specimens.`, "info", {
          group: "specimen-died",
        });
    }, 1000);
    return () => clearInterval(t);
  }, [specimens, game, setSpecimens]);
  return { specimens, setSpecimens, togglePin };
}
