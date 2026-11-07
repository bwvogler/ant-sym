import type { RunSummary } from "../../shared/jev.ts";
import type { Backend } from "./backend.ts";

// Jev is always on in the fungus game (ja-lo8.2, PRD §49): the page starts a run as soon as the server and its key are
// there. Words only matter if Jev can read them, so when it can't (no server, no key, the run's spend cap reached, a
// failed start), no policy can be changed, the fungus's aim or a colony's doctrine. The game keeps playing on the
// answers Jev already gave (colonyJev.ts #lookup). Pure, so the reasons are tested.

/** What policyLock and shouldStart read of the Jev client's state. */
export interface JevStatus {
  phase: "off" | "running" | "stopped";
  run: Pick<RunSummary, "stopReason" | "caps"> | null;
  lastError: string | null;
}

/**
 * Why no policy can be changed now, in words for the player, or null when Jev is running and can read new words.
 * `starting` is true while the page's own start is on the wire.
 */
export function policyLock(b: Backend | null, s: JevStatus, starting = false): string | null {
  if (b === null) return "Checking for the Jev server…";
  if (!b.hasBackend) return "No Jev server in this build: the game plays the answers Jev already gave, and policies can't be changed.";
  if (!b.hasKey) return "JEV_API_KEY is not set in the server's environment: the game plays the answers Jev already gave, and policies can't be changed.";
  if (s.phase === "running") return null;
  if (starting) return "Starting Jev…";
  if (s.phase === "stopped") {
    const reason = s.run?.stopReason ?? null;
    if (reason === "spend-cap") return `Jev's spend cap for this run ($${(s.run?.caps.capUsd ?? 0).toFixed(2)}) is reached: the game plays the answers Jev already gave, and policies can't be changed.`;
    if (reason === "time-cap") return "Jev's run reached its time cap; starting a new one…";
    if (reason === "user") return "Jev is stopped (Details → Resume Jev): policies can't be changed until it runs.";
    return `Jev stopped${s.lastError ? `: ${s.lastError}` : ""}. Policies can't be changed until it runs (Details → Resume Jev).`;
  }
  return s.lastError ? `Jev couldn't start: ${s.lastError}. Details → Resume Jev to try again.` : "Starting Jev…";
}

/**
 * Whether the page should start a run now. Once per page when the server and key are there (a failed start is not
 * retried by itself: Details → Resume), and again whenever a run ends at its time cap, which is a guard against a run
 * left open, not a budget. A run that ended at its spend cap, or that the player stopped, stays stopped.
 */
export function shouldStart(b: Backend | null, s: JevStatus, startedOnce: boolean, starting: boolean): boolean {
  if (starting || !b?.hasBackend || !b.hasKey) return false;
  if (s.phase === "off") return !startedOnce;
  if (s.phase === "stopped") return s.run?.stopReason === "time-cap";
  return false;
}

/** Whether the player can start Jev by hand (Details → Resume): a server and key, and no run on or starting. */
export function canResume(b: Backend | null, s: JevStatus, starting: boolean): boolean {
  return !!b?.hasBackend && b.hasKey && s.phase !== "running" && !starting;
}
