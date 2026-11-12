import { openLearn } from "./learn.ts";
import { FAST_SPEED, type Card, type TutorialStep } from "./tutorial.ts";

// The tutorial's coach card (ja-7x4, PRD §61), over the field's lower-left corner: one step at a time, the step's
// button (or nothing while the game decides), Faster on a live step, and Skip.

const ORDER: Record<TutorialStep, number> = { landing: 1, waiting: 2, host: 3, watch: 4, cleared: 5, died: 5, timeout: 5, aim: 6, done: 6 };

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
  return (
    <section
      className="pointer-events-auto absolute bottom-3 left-3 z-10 w-[min(22rem,calc(100%-1.5rem))] rounded-lg border border-spore/50 bg-panel/95 p-3 text-sm shadow-lg"
      aria-label="tutorial"
      role="dialog"
    >
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
          <button
            type="button"
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink hover:bg-accent-hover"
            onClick={onNext}
            autoFocus
          >
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
        <button type="button" className="ml-auto text-xs text-fg-3 hover:text-fg-2" onClick={onSkip}>
          Skip tutorial
        </button>
      </div>
    </section>
  );
}
