import { openLearn, type LearnTarget } from "./learn.ts";

/** A small "?" that opens the Learn drawer at `to`. */
export default function Help({ to, label }: { to: LearnTarget; label: string }) {
  return (
    <button
      type="button"
      className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-line align-middle font-sans text-[10px] leading-none text-fg-3 hover:border-accent hover:text-accent focus-visible:outline-2 focus-visible:outline-accent"
      onClick={() => openLearn(to)}
      aria-label={`Learn: ${label}`}
      title={`Learn: ${label}`}
    >
      ?
    </button>
  );
}
