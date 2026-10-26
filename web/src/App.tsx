import { useEffect, useState } from "react";
import type { RunSummary } from "../shared/jev.ts";

// Milestone 1 shell: proves the proxy, the key and the ledger are wired.
// The field, the ants and the panel land in milestone 2.

type Health = { ok: boolean; hasKey: boolean; run: RunSummary };

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)));
  }, []);
  return (
    <main className="mx-auto flex h-full max-w-3xl flex-col gap-6 px-4 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Jev Ants</h1>
        <p className="text-fg-2">Ants that form the picture you type or upload, one Jev decision at a time.</p>
      </header>
      <section className="rounded-lg border border-line bg-panel p-4 font-mono text-sm">
        {error && <p className="text-err">{error}</p>}
        {!health && !error && <p className="text-fg-3">checking the server…</p>}
        {health && (
          <ul className="space-y-1">
            <li>server: {health.ok ? "ok" : "down"}</li>
            <li>
              JEV_API_KEY: {health.hasKey ? <span className="text-accent">present</span> : <span className="text-warn">missing — /api/jev answers 503</span>}
            </li>
            <li>run: {health.run.running ? "running" : "idle"}</li>
            <li>caps: ${health.run.caps.capUsd.toFixed(2)} · {health.run.caps.capSeconds}s</li>
          </ul>
        )}
      </section>
    </main>
  );
}
