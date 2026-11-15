import { Icon } from "./kit.tsx";
import { openLearn } from "./learn.ts";
import type { LensLine } from "./lens.ts";

// The lens's card (PRD §69.3, ja-mvo9.2): what is under the pointer, beside it. Following a mouse it takes no clicks (so
// the map keeps the pointer); a click on the map pins it, and then each line's "more" opens its guide entry, and an ant
// can be followed. It opens toward the middle of the screen, so it never runs off an edge.

/** The card's width, in CSS pixels (18 rem), where the screen has room. */
const CARD_W = 288;

export default function LensCard({
  lines,
  x,
  y,
  pinned,
  onClose,
  onFollow,
}: {
  lines: readonly LensLine[];
  /** the pointer, in the page's pixels */
  x: number;
  y: number;
  pinned: boolean;
  onClose: () => void;
  /** follow the ant the card names (pinned, with an ant) */
  onFollow?: () => void;
}) {
  // Toward the middle of the screen from the pointer, and kept inside it (a phone is narrower than two cards).
  const vw = window.innerWidth;
  const w = Math.min(CARD_W, vw - 16);
  const left = Math.max(8, Math.min(vw - w - 8, x > vw / 2 ? x - 14 - w : x + 14));
  const below = y < window.innerHeight / 2;
  const style = { left, width: w, ...(below ? { top: y + 14 } : { bottom: window.innerHeight - y + 14 }) };
  return (
    <section
      aria-label="lens"
      style={style}
      className={`fixed z-30 rounded-lg border border-line bg-panel/95 p-2.5 text-[13px] shadow-lg backdrop-blur-sm ${
        pinned ? "pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {pinned && (
        <button
          type="button"
          className="float-right -mt-1 -mr-1 grid size-7 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
          onClick={onClose}
          aria-label="Close the lens card"
        >
          <Icon name="close" className="size-3.5" />
        </button>
      )}
      <ul className="flex flex-col gap-1.5">
        {lines.map((l) => (
          <li key={l.what}>
            <span className="font-medium text-fg">{l.what}</span>
            <span className="text-fg-2">: {l.says}</span>
            {pinned && l.entry && (
              <button
                type="button"
                className="ml-1.5 text-xs text-accent underline-offset-2 hover:underline"
                onClick={() => (onClose(), openLearn({ tab: "guide", id: l.entry! }))}
                aria-label={`More on ${l.what.toLowerCase()}`}
              >
                more
              </button>
            )}
          </li>
        ))}
      </ul>
      {pinned && onFollow && (
        <button
          type="button"
          className="mt-2 rounded-md border border-line px-2.5 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={onFollow}
        >
          Follow this ant
        </button>
      )}
      {!pinned && <p className="mt-2 text-[11px] text-fg-3">Click to keep this card and follow its links.</p>}
    </section>
  );
}
