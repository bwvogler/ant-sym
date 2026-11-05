import { useCallback, useEffect, useState } from "react";
import { detectBackend, type Backend } from "./backend.ts";

let cached: Promise<Backend> | null = null;

/** The backend probe, once per page; `recheck` asks again (after the passphrase is entered). */
export function useBackend(): { backend: Backend | null; recheck: () => void } {
  const [b, setB] = useState<Backend | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    cached ??= detectBackend();
    let live = true;
    void cached.then((v) => live && setB(v));
    return () => {
      live = false;
    };
  }, [tick]);
  const recheck = useCallback(() => {
    cached = null;
    setTick((t) => t + 1);
  }, []);
  return { backend: b, recheck };
}
