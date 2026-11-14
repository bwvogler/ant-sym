import { useId, useMemo, useState } from "react";
import { type Command, rank } from "./commands.ts";
import { Kbd, Modal } from "./kit.tsx";

// The command palette (PRD §69.3, ja-mvo9.2): ⌘K or Ctrl+K, or the HUD's search button. Every action on the page by name:
// type to narrow, arrows to choose, Enter to run. The matching is commands.ts's.

/** A command the page can run now. */
export interface Runnable extends Command {
  run: () => void;
}

export default function Palette({ commands, onClose }: { commands: readonly Runnable[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);
  const shown = useMemo(() => rank(commands, query), [commands, query]);
  const active = Math.min(at, shown.length - 1);
  const list = useId();
  const optionId = (n: number) => `${list}-${n}`;
  const run = (c: Runnable | undefined) => {
    if (!c || c.off) return;
    onClose();
    c.run();
  };
  return (
    <Modal label="command palette" onClose={onClose}>
      <div className="flex items-center gap-2 border-b border-line px-3">
        <span aria-hidden className="text-fg-3">
          ⌘
        </span>
        <input
          className="min-w-0 flex-1 bg-transparent py-3 text-[15px] text-fg outline-none placeholder:text-fg-3"
          placeholder="Type a command: speed, mutations, follow a host, learn…"
          role="combobox"
          aria-label="command"
          aria-expanded="true"
          aria-controls={list}
          aria-activedescendant={shown.length ? optionId(active) : undefined}
          aria-autocomplete="list"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const n = shown.length;
              if (n) setAt((active + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
            } else if (e.key === "Enter") {
              e.preventDefault();
              run(shown[active]);
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>
      <ul id={list} role="listbox" aria-label="commands" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {shown.map((c, n) => {
          const head = !query && (n === 0 || shown[n - 1]!.group !== c.group);
          return (
            <li key={c.id} role="presentation">
              {head && <div className="px-2.5 pt-2 pb-1 text-[11px] font-medium tracking-wide text-fg-3 uppercase">{c.group}</div>}
              <div
                id={optionId(n)}
                role="option"
                aria-selected={n === active}
                aria-disabled={c.off ? true : undefined}
                title={c.off}
                className={`flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-[13px] ${
                  n === active ? "bg-accent-soft text-fg" : "text-fg-2"
                } ${c.off ? "opacity-50" : ""}`}
                onPointerMove={() => n !== active && setAt(n)}
                onClick={() => run(c)}
              >
                <span className="min-w-0 flex-1 truncate">{c.label}</span>
                {query && <span className="shrink-0 text-[11px] text-fg-3">{c.group}</span>}
                {c.off && <span className="shrink-0 text-[11px] text-fg-3">{c.off}</span>}
                {c.key && <Kbd>{c.key}</Kbd>}
              </div>
            </li>
          );
        })}
        {!shown.length && <li className="px-3 py-4 text-center text-[13px] text-fg-3">No command matches “{query}”.</li>}
      </ul>
    </Modal>
  );
}
