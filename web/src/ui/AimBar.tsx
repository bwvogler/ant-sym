import { AIMS } from "../colony/index.ts";
import Help from "./Help.tsx";
import Tip from "./Tip.tsx";
import { FLOAT } from "./kit.tsx";
import { PresetPicker, WordsBox } from "./PolicyEditor.tsx";
import { useJev, useJevSession } from "./jevContext.tsx";

// The fungus's aim as a bar along the bottom of the map (PRD §69.2, ja-mvo9.2): the presets and the player's words,
// one line until it has focus, then four. From 1024 px wide; narrower, the aim lives in The fungus drawer.

export default function AimBar({
  tokens,
  leftOpen,
}: {
  /** tokens per situation asked, for the field's tooltip */
  tokens: number;
  /** a drawer is open at the left: the bar keeps clear of it (the inspector stops above the bar instead) */
  leftOpen: boolean;
}) {
  const session = useJevSession();
  const aim = useJev((s) => s.aim);
  // Why the aim can't change now (Jev locked), or null.
  const lock = useJev((s) => s.lock);
  const { setAim, draftAim } = session;
  const locked = lock !== null;
  return (
    // The free width along the map's bottom: past the rail (and an open drawer), at most 46 rem. The inspector stops
    // above it (owner, review of #189: D1 b).
    <div
      className={`pointer-events-none absolute bottom-3 z-10 hidden justify-center lg:flex ${leftOpen ? "left-[27rem]" : "left-16"} right-3`}
    >
      <div aria-label="fungus aim" className={`pointer-events-auto flex w-full max-w-[46rem] items-end gap-2 px-2 py-1.5 ${FLOAT}`}>
        <span className="flex shrink-0 items-center gap-1 self-center pl-1 text-[11px] font-medium tracking-wide text-spore uppercase">
          Aim <Help to={{ tab: "policy", id: "fungus" }} label="how the fungus decides" />
        </span>
        <PresetPicker
          style="compact"
          label="aim presets"
          presets={AIMS}
          active={(a) => aim.id === a.id}
          disabled={locked}
          onPick={(a) => setAim({ id: a.id, text: a.text })}
        />
        {/* Enter commits (blur), Shift+Enter is a new line; Escape leaves the words as typed and gives the map the keys. */}
        <WordsBox
          label="aim"
          className="min-w-0 flex-1 px-2 py-1 text-[13px] leading-snug"
          grow
          enterCommits
          value={aim.text}
          disabled={locked}
          title={
            lock ??
            `What the fungus wants, in your words. Jev reads it and decides what the fungus does inside each ant it lives in. ≈ ${tokens} tokens per situation asked.`
          }
          onDraft={(text) => draftAim({ id: "custom", text })}
          onCommit={(text) => setAim({ id: aim.id, text })}
        />
        {locked && (
          <Tip tip={lock} className="shrink-0 self-center text-xs text-warn">
            locked
          </Tip>
        )}
      </div>
    </div>
  );
}
