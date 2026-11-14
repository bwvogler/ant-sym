import { useState } from "react";
import { AIMS } from "../colony/index.ts";
import Help from "./Help.tsx";
import { FLOAT } from "./kit.tsx";
import { seg } from "./styles.ts";
import type { DoctrineChoice } from "./useColonyJev.ts";

// The fungus's aim as a bar along the bottom of the map (PRD §69.2, ja-mvo9.2): the presets and the player's words,
// one line until it has focus, then four. From 1024 px wide; narrower, the aim lives in The fungus drawer.

export default function AimBar({
  aim,
  setAim,
  draftAim,
  lock,
  tokens,
  leftOpen,
  rightOpen,
}: {
  aim: DoctrineChoice;
  setAim: (a: DoctrineChoice) => void;
  draftAim: (a: DoctrineChoice) => void;
  /** why the aim can't change now (Jev locked), or null */
  lock: string | null;
  /** tokens per situation asked, for the field's tooltip */
  tokens: number;
  /** a drawer is open at the left, or the inspector at the right: the bar keeps clear of it */
  leftOpen: boolean;
  rightOpen: boolean;
}) {
  const [open, setOpen] = useState(false);
  const locked = lock !== null;
  return (
    // The free width along the map's bottom: past the rail (and an open drawer), short of the inspector; at most 46 rem.
    <div
      className={`pointer-events-none absolute bottom-3 z-10 hidden justify-center lg:flex ${leftOpen ? "left-[27rem]" : "left-16"} ${rightOpen ? "right-[27.5rem]" : "right-3"}`}
    >
      <div aria-label="fungus aim" className={`pointer-events-auto flex w-full max-w-[46rem] items-end gap-2 px-2 py-1.5 ${FLOAT}`}>
        <span className="flex shrink-0 items-center gap-1 self-center pl-1 text-[11px] font-medium tracking-wide text-spore uppercase">
          Aim <Help to={{ tab: "policy", id: "fungus" }} label="how the fungus decides" />
        </span>
        <div className="flex shrink-0 overflow-hidden rounded-md border border-line text-[13px]" role="group" aria-label="aim presets">
          {AIMS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`${seg(aim.id === a.id)} px-2.5 py-1`}
              aria-pressed={aim.id === a.id}
              disabled={locked}
              onClick={() => setAim({ id: a.id, text: a.text })}
            >
              {a.name}
            </button>
          ))}
        </div>
        <textarea
          className={`min-w-0 flex-1 resize-none rounded-md border border-line bg-paper px-2 py-1 text-[13px] leading-snug text-fg outline-none focus:border-accent disabled:opacity-60 ${open ? "" : "overflow-hidden"}`}
          rows={open ? 4 : 1}
          wrap={open ? "soft" : "off"}
          value={aim.text}
          disabled={locked}
          title={
            lock ??
            `What the fungus wants, in your words. Jev reads it and decides what the fungus does inside each ant it lives in. ≈ ${tokens} tokens per situation asked.`
          }
          onFocus={() => setOpen(true)}
          onChange={(e) => draftAim({ id: "custom", text: e.target.value })}
          onBlur={(e) => {
            setOpen(false);
            setAim({ id: aim.id, text: e.target.value });
          }}
          onKeyDown={(e) => {
            // Enter commits (blur), Shift+Enter is a new line; Escape leaves the words as typed and gives the map the keys.
            if ((e.key === "Enter" && !e.shiftKey) || e.key === "Escape") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          aria-label="aim"
        />
        {locked && <span className="shrink-0 self-center text-xs text-warn">locked</span>}
      </div>
    </div>
  );
}
