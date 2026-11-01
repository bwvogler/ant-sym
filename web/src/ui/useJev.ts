import { useCallback, useEffect, useMemo, useState } from "react";
import type { RunCaps } from "../../shared/jev.ts";
import { DEFAULT_CAPS } from "../../shared/jev.ts";
import type { Engine } from "../sim/engine.ts";
import { POLICY_CONTEXT, type Schema } from "../sim/jevBrain.ts";
import { PolicyCache, type CachedAnswer } from "../sim/policyCache.ts";
import { JevScheduler, type SchedulerState } from "./jevScheduler.ts";

// React face of the scheduler: one instance per engine, its state mirrored
// into React, caps and schema editable, and the "formed → stop" rule. The
// situation cache is kept in localStorage under its policy context, so a
// reload does not pay again for situations already asked.

const CACHE_STORE = `jev-ants:policy-cache:${POLICY_CONTEXT}`;

function loadCache(): PolicyCache {
  try {
    const raw = localStorage.getItem(CACHE_STORE);
    const entries = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(entries)) {
      const ok = entries.filter((e): e is [string, CachedAnswer] => Array.isArray(e) && typeof e[0] === "string" && typeof e[1]?.choice === "string" && typeof e[1]?.pSettle === "number" && typeof e[1]?.probabilities === "object");
      return new PolicyCache(POLICY_CONTEXT, ok);
    }
  } catch {
    // storage blocked or unreadable: start cold
  }
  return new PolicyCache(POLICY_CONTEXT);
}

function saveCache(cache: PolicyCache): void {
  try {
    if (cache.size === 0) localStorage.removeItem(CACHE_STORE);
    else localStorage.setItem(CACHE_STORE, JSON.stringify(cache.entries()));
  } catch {
    // storage blocked or full: the cache still lives for this page load
  }
}

export function useJev(engine: Engine, formed: boolean, targetVersion: number, blank: boolean) {
  const scheduler = useMemo(() => new JevScheduler(engine, {}, loadCache()), [engine]);
  const [state, setState] = useState<SchedulerState>(scheduler.state);
  const [caps, setCaps] = useState<RunCaps>(DEFAULT_CAPS);
  const [schema, setSchemaState] = useState<Schema>("compass");
  const [stopOnFormed, setStopOnFormed] = useState(true);
  const [overseer, setOverseerState] = useState(true);
  const setOverseer = useCallback(
    (on: boolean) => {
      scheduler.setOptions({ overseer: on });
      setOverseerState(on);
    },
    [scheduler],
  );

  useEffect(() => {
    const off = scheduler.subscribe(setState);
    return () => {
      off();
      // Leaving the page (the colony tab unmounts it): keep the answers the run paid for, and end
      // the run on the server instead of leaving it open until its time cap.
      if (scheduler.state.phase === "running") void scheduler.stop("user");
      saveCache(scheduler.cache);
      scheduler.dispose();
    };
  }, [scheduler]);

  // Persist the cache whenever a run is not going (a run's end, a cleared cache).
  useEffect(() => {
    if (state.phase !== "running") saveCache(scheduler.cache);
  }, [state.phase, state.cache.situations, scheduler]);
  const clearCache = useCallback(() => scheduler.clearCache(), [scheduler]);

  const start = useCallback(() => void scheduler.start(caps), [scheduler, caps]);
  const stop = useCallback(() => void scheduler.stop("user"), [scheduler]);
  const setSchema = useCallback(
    (s: Schema) => {
      scheduler.setOptions({ schema: s });
      setSchemaState(s);
    },
    [scheduler],
  );

  // Formed while running: stop spending. Only after Jev has actually decided
  // something and a few seconds have passed, so a picture the local rule left
  // behind does not end the run before it starts.
  useEffect(() => {
    if (formed && stopOnFormed && state.phase === "running" && state.requestsSent > 0 && scheduler.runSeconds > 3) {
      void scheduler.stop("formed");
    }
  }, [formed, stopOnFormed, state.phase, state.requestsSent, scheduler, engine]);
  // A picture cleared mid-run can never form and every ant would re-ask until the cap: stop.
  useEffect(() => {
    if (blank && state.phase === "running") void scheduler.stop("blank");
  }, [blank, state.phase, scheduler]);
  const blankStopped = blank && state.phase === "stopped" && state.stoppedFor === "blank";
  // The target changed since the run ended: Start is a morph from the old shape.
  const morphPending = state.phase === "stopped" && targetVersion !== state.stoppedOnTarget;

  return { state, caps, setCaps, schema, setSchema, start, stop, stopOnFormed, setStopOnFormed, overseer, setOverseer, morphPending, blankStopped, clearCache };
}
