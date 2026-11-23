import { createContext, useContext, useSyncExternalStore } from "react";
import type { JevSession, JevSnapshot } from "./jevSession.ts";

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
