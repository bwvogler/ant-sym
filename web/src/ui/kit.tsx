import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// The page's building blocks (PRD §69, ja-mvo9.1): one panel, one section head, one set of buttons and icons, and the
// drawer that holds a surface beside the map (a bottom sheet on a phone). Components use these rather than hand-rolling
// the classes, so the page reads as one design.

/** The floating surface over the map: the HUD, the rail, a drawer, the inspector. */
export const FLOAT = "rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur-sm";

export function Panel({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={`rounded-lg border border-line bg-panel px-4 py-3 text-sm text-fg-2 ${className}`}>
      {children}
    </section>
  );
}

export function SectionHead({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <h3 className={`flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-fg-3 uppercase ${className}`}>{children}</h3>;
}

type Tone = "primary" | "quiet" | "danger";
const TONE: Record<Tone, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent-hover",
  quiet: "border border-line text-fg-2 hover:bg-raised",
  danger: "border border-err/50 text-err hover:bg-err-soft",
};

export function Button({ tone = "quiet", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone }) {
  return (
    <button
      type="button"
      className={`rounded-md px-3 py-1.5 text-[13px] font-medium disabled:pointer-events-none disabled:opacity-40 ${TONE[tone]} ${className}`}
      {...rest}
    />
  );
}

/** A square button holding an icon; `label` is its accessible name and its tooltip. */
export function IconButton({
  icon,
  label,
  active = false,
  badge,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string; active?: boolean; badge?: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={`relative grid size-10 shrink-0 place-items-center rounded-lg transition-colors ${
        active ? "bg-accent text-accent-ink" : "text-fg-2 hover:bg-raised hover:text-fg"
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} />
      {badge !== undefined && (
        <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-spore px-1 text-[10px] leading-4 text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

// Inline icons (24-unit grid, stroked with the text colour): no icon dependency.
const PATHS = {
  play: "M7 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  fungus: "M4 12a8 7 0 0 1 16 0zM10 12v6a2 2 0 0 0 4 0v-6M8 9.5h.01M12 8h.01M16 9.5h.01",
  evolve: "M7 3c0 6 10 6 10 12s-10 6-10 6M17 3c0 6-10 6-10 12s10 6 10 6M8 7h8M8 17h8",
  colonies:
    "M6 9a2 2 0 1 0 0-.01M12 7a2 2 0 1 0 0-.01M18 9a2 2 0 1 0 0-.01M3 19c.5-3 2-5 3-5s2.5 2 3 5M9 19c.5-4 2-7 3-7s2.5 3 3 7M15 19c.5-3 2-5 3-5s2.5 2 3 5",
  saves: "M6 3h12v18l-6-4-6 4z",
  learn: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M19 19v2H6",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z",
  close: "M6 6l12 12M18 6L6 18",
  view: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
} as const;
export type IconName = keyof typeof PATHS;

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  const filled = name === "play";
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

/**
 * A surface beside the map: on a desktop a column at `side`, under the HUD; on a phone a bottom sheet over the tab bar.
 * Escape closes it (unless something above it, the Learn drawer or a dialog, has the keyboard).
 */
export function Drawer({
  label,
  title,
  side = "left",
  onClose,
  children,
}: {
  label: string;
  title: ReactNode;
  side?: "left" | "right";
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape closes the topmost thing only: an open tooltip, the Learn drawer or Details first.
      if (document.querySelector('[role="tooltip"], [role="dialog"][aria-label="Learn"], [role="dialog"][aria-label="Details"]')) return;
      onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const place =
    side === "left"
      ? "sm:top-[4.5rem] sm:bottom-3 sm:left-16 sm:w-[22rem]"
      : "sm:top-[4.5rem] sm:right-3 sm:bottom-auto sm:left-auto sm:max-h-[calc(100dvh-6rem)] sm:w-[26rem]";
  return (
    <section
      ref={ref}
      aria-label={label}
      className={`pointer-events-auto absolute inset-x-2 bottom-16 z-10 flex max-h-[62dvh] flex-col sm:inset-x-auto sm:max-h-none ${place} ${FLOAT}`}
    >
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
        <button
          type="button"
          className="ml-auto grid size-8 place-items-center rounded-md text-fg-3 hover:bg-raised hover:text-fg"
          onClick={onClose}
          aria-label={`Close ${label}`}
        >
          <Icon name="close" className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-fg-2">{children}</div>
    </section>
  );
}
