import { useState } from "react";
import { openLearn } from "./learn.ts";
import { FAST_SPEED, type Card, type TutorialStep } from "./tutorial.ts";

// The tutorial's coach card (ja-7x4, PRD §61), over the field's lower-left corner: one step at a time, the step's
// button (or nothing while the game decides), Faster on a live step, Hide and Skip. Hide shrinks the card to a strip with
// the step's button, so the map shows (on a phone the card covers most of it); the next step opens a full card again.

const ORDER: Record<TutorialStep, number> = { landing: 1, waiting: 2, host: 3, watch: 4, cleared: 5, died: 5, timeout: 5, aim: 6, done: 6 };

const shell =
  "pointer-events-auto absolute bottom-3 left-3 z-10 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-spore/50 bg-panel/95 shadow-lg";
const primary = "rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-hover";

export default function TutorialCard({
  step,
  card,
  fast,
  onNext,
  onFaster,
  onSkip,
}: {
  step: TutorialStep;
  card: Card;
  fast: boolean;
  onNext: () => void;
  onFaster: () => void;
  onSkip: () => void;
}) {
  // Hidden for this step only: a different step is a different card, shown in full. (Keyed by the step, so no reset is needed.)
  const [hiddenAt, setHiddenAt] = useState<TutorialStep | null>(null);
  if (hiddenAt === step)
    return (
      <section className={`${shell} flex items-center gap-2 px-3 py-2 text-sm`} aria-label="tutorial" role="dialog">
        <span className="min-w-0 flex-1 truncate font-medium text-fg">
          <span className="mr-1.5 text-[11px] font-normal text-fg-3 tabular-nums">{ORDER[step]} / 6</span>
          {card.title}
        </span>
        {card.next && (
          <button type="button" className={primary} onClick={onNext}>
            {card.next}
          </button>
        )}
        <button
          type="button"
          className="rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={() => setHiddenAt(null)}
          aria-label="Show the tutorial card"
          autoFocus
        >
          Show
        </button>
      </section>
    );
  return (
    <section className={`${shell} p-3 text-sm`} aria-label="tutorial" role="dialog">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-medium text-fg">{card.title}</h2>
        <span className="text-[11px] text-fg-3 tabular-nums">{ORDER[step]} / 6</span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1.5 text-[13px] leading-snug text-fg-2">
        {card.body.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {card.next && (
          <button type="button" className={primary} onClick={onNext} autoFocus>
            {card.next}
          </button>
        )}
        {card.faster && (
          <button
            type="button"
            className="rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised disabled:opacity-60"
            onClick={onFaster}
            disabled={fast}
            aria-pressed={fast}
          >
            {fast ? `running at ${FAST_SPEED}×` : "Faster"}
          </button>
        )}
        {card.learn && (
          <button
            type="button"
            className="text-xs text-accent underline-offset-2 hover:underline"
            onClick={() => openLearn({ tab: "guide", id: card.learn! })}
          >
            more in Learn
          </button>
        )}
        <button
          type="button"
          className="ml-auto rounded-md border border-line px-2 py-1 text-xs text-fg-2 hover:bg-raised"
          onClick={() => setHiddenAt(step)}
          aria-label="Hide the tutorial card"
          title="Hide this card to see the map; the next step shows its card again"
        >
          Hide
        </button>
        <button type="button" className="text-xs text-fg-3 hover:text-fg-2" onClick={onSkip}>
          Skip tutorial
        </button>
      </div>
    </section>
  );
}
