import { useEffect, useState } from "react";
import { detectBackend, type Backend } from "./backend.ts";

let cached: Promise<Backend> | null = null;
const listeners = new Set<() => void>();

/** Probe again (after the passphrase is entered): every useBackend on the page gets the new answer. */
export function recheckBackend(): void {
  cached = null;
  for (const l of listeners) l();
}

export function useBackend(): Backend | null {
  const [b, setB] = useState<Backend | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    listeners.add(bump);
    return () => void listeners.delete(bump);
  }, []);
  useEffect(() => {
    cached ??= detectBackend();
    let live = true;
    void cached.then((v) => live && setB(v));
    return () => {
      live = false;
    };
  }, [tick]);
  return b;
}
