import { useState } from "react";
import { setPassphrase } from "./backend.ts";

// The hosted builds (GitHub Pages) reach Jev through a proxy that wants a
// passphrase (docs/hosting.md). It is kept in this browser's localStorage.

export default function PassNote({ onSaved, wrong }: { onSaved: () => void; wrong: boolean }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-accent-soft px-3 py-1.5 text-sm text-accent"
      onSubmit={(e) => {
        e.preventDefault();
        setPassphrase(value.trim() || null);
        onSaved();
      }}
    >
      <label htmlFor="jev-pass">{wrong ? "That passphrase was refused. Try again to let Jev steer the ants:" : "Jev is hosted for this page behind a passphrase. Enter it to let Jev steer the ants:"}</label>
      <input
        id="jev-pass"
        type="password"
        autoComplete="current-password"
        className="min-w-0 flex-1 rounded-md border border-line bg-paper px-2 py-1 font-mono text-fg outline-none focus:border-accent"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" className="rounded-md bg-accent px-3 py-1 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:opacity-50" disabled={!value.trim()}>
        Unlock
      </button>
    </form>
  );
}
