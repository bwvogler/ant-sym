import { useEffect, useRef, type RefObject } from "react";

/** A ref that holds `value` as of the last commit: what a frame's callbacks read each time they run without being built again (ColonyField's props). */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
