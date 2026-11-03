import { useEffect, useState } from "react";
import { detectBackend, type Backend } from "./backend.ts";

let cached: Promise<Backend> | null = null;

export function useBackend(): Backend | null {
  const [b, setB] = useState<Backend | null>(null);
  useEffect(() => {
    cached ??= detectBackend();
    let live = true;
    void cached.then((v) => live && setB(v));
    return () => {
      live = false;
    };
  }, []);
  return b;
}
