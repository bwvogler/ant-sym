import { createContext, useContext, useMemo, useSyncExternalStore } from "react";
import type { DoctrineChoice, JevSession, JevSnapshot } from "./jevSession.ts";

// How the page reaches the Jev session (ja-fnd.6.1, docs/refactor.md S5.1): one context carrying the session, and selector hooks over its snapshot, in
// the pattern of ui/session.ts. A leaf takes the values it draws with `useJev(select)` and its commands from `useJevSession()`, so it draws again only
// when a value it selected changes, and nothing is passed down as a prop.

export const JevContext = createContext<JevSession | null>(null);

/** The session: the commands (setAim, setDoctrine, start, stop…) and the client. A stable object, so holding it never draws again. */
export function useJevSession(): JevSession {
  const s = useContext(JevContext);
  if (!s) throw new Error("no Jev session: render under ColonyApp, which provides it");
  return s;
}

/**
 * A value of the session's snapshot, drawn again only when it changes. `select` returns a field of the snapshot or a primitive from it (`s => s.lock`,
 * `s => s.aim`), never a new object or array: the same snapshot must give the same value, or React draws without end.
 */
export function useJev<T>(select: (s: JevSnapshot) => T): T {
  const session = useJevSession();
  return useSyncExternalStore(session.subscribe, () => select(session.snapshot()));
}

/**
 * The whole snapshot with the commands, in the shape the page held Jev in before the context: for the page-level code that has not moved onto
 * selectors yet (saves, the pen, the notices). It draws again on every change of the snapshot, as the page did.
 */
export function useJevView() {
  const session = useJevSession();
  const snap = useSyncExternalStore(session.subscribe, session.snapshot);
  return useMemo(
    () => ({
      session,
      client: session.client,
      phase: snap.phase,
      lock: snap.lock,
      resumable: snap.resumable,
      backendBudget: snap.backendBudget,
      doctrines: snap.doctrines as DoctrineChoice[],
      aim: snap.aim,
      start: session.start,
      stop: session.stop,
      restore: session.restore,
      setDoctrine: session.setDoctrine,
      draftDoctrine: session.draftDoctrine,
      foundWith: session.foundWith,
      setAim: session.setAim,
      draftAim: session.draftAim,
      explain: session.explain,
      explainFungus: session.explainFungus,
      fungusAnswers: session.fungusAnswers,
    }),
    [session, snap],
  );
}

export type JevView = ReturnType<typeof useJevView>;
