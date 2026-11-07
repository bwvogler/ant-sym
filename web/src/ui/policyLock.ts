import type { RunSummary } from "../../shared/jev.ts";
import type { Backend } from "./backend.ts";

// Jev in the fungus game (ja-lo8.2, PR #42 review S6): the page plays the answers it ships and the answers Jev gave
// before, run or no run (colonyJev.ts #lookup), and asks Jev only when the player changes a policy, the fungus's aim or
// a colony's doctrine: a run starts with the change, asks the situations with no answer under the new words as they
// come up, and ends at its time cap. Words only matter if Jev can read them, so where it can't (no server, no key, the
// spend cap reached, the player's Stop, a failed start), no policy can be changed. Pure, so the reasons are tested.

/** What policyLock and shouldStart read of the Jev client's state. */
export interface JevStatus {
  phase: "off" | "running" | "stopped";
  run: Pick<RunSummary, "stopReason" | "caps"> | null;
  lastError: string | null;
}

/**
 * Why no policy can be changed now, in words for the player, or null when new words can be taken: Jev is running, or
 * starting, or idle (never started, or its last run ended at its time cap), so a change starts a run (shouldStart).
 * `starting` is true while the page's own start is on the wire.
 */
export function policyLock(b: Backend | null, s: JevStatus, starting = false): string | null {
  if (b === null) return "Checking for the Jev server…";
  if (!b.hasBackend) return "No Jev server in this build: the game plays the answers Jev already gave, and policies can't be changed.";
  if (!b.hasKey) return "JEV_API_KEY is not set in the server's environment: the game plays the answers Jev already gave, and policies can't be changed.";
  if (s.phase === "running" || starting) return null;
  if (s.phase === "stopped") {
    const reason = s.run?.stopReason ?? null;
    if (reason === "spend-cap") return `Jev's spend cap for this run ($${(s.run?.caps.capUsd ?? 0).toFixed(2)}) is reached: the game plays the answers Jev already gave, and policies can't be changed.`;
    if (reason === "time-cap") return null;
    if (reason === "user") return "Jev is stopped (Details → Resume Jev): policies can't be changed until it runs.";
    return `Jev stopped${s.lastError ? `: ${s.lastError}` : ""}. Policies can't be changed until it runs (Details → Resume Jev).`;
  }
  return s.lastError ? `Jev couldn't start: ${s.lastError}. Details → Resume Jev to try again.` : null;
}

/**
 * Whether a change of words should start a run now: the words can be taken (policyLock) and no run is on or starting.
 * Nothing starts a run by itself: not the page's load, not a run's time cap (PR #42 review S6).
 */
export function shouldStart(b: Backend | null, s: JevStatus, starting: boolean): boolean {
  return !starting && s.phase !== "running" && policyLock(b, s, starting) === null;
}

/** Whether the player can start Jev by hand (Details → Resume): a server and key, and no run on or starting. */
export function canResume(b: Backend | null, s: JevStatus, starting: boolean): boolean {
  return !!b?.hasBackend && b.hasKey && s.phase !== "running" && !starting;
}
