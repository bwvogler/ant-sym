import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";

// The page's building blocks (PRD §69, ja-mvo9.1): one section head, one set of buttons and icons, and the drawer that
// holds a surface beside the map (a bottom sheet on a phone). Components use these rather than hand-rolling the
// classes, so the page reads as one design.

/** The floating surface over the map: the HUD, the rail, a drawer, the inspector. */
export const FLOAT = "rounded-xl border border-line bg-panel/95 shadow-lg backdrop-blur-sm";

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

/**
 * A square button holding an icon; `label` is its accessible name and its tooltip. `active` makes it a toggle (pressed
 * or not); left out, it is a plain button and says nothing of being pressed.
 */
export function IconButton({
  icon,
  label,
  active,
  badge,
  badgeLabel,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  active?: boolean;
  badge?: ReactNode;
  /** what the badge means, read out as the button's description (its name stays `label`) */
  badgeLabel?: string;
}) {
  const said = useId();
  const shown = badge !== undefined;
  return (
    <button
      type="button"
      aria-label={label}
      title={shown && badgeLabel ? `${label}: ${badgeLabel}` : label}
      aria-describedby={shown && badgeLabel ? said : undefined}
      aria-pressed={active}
      className={`relative grid size-10 shrink-0 place-items-center rounded-lg transition-colors ${
        active ? "bg-accent text-accent-ink" : "text-fg-2 hover:bg-raised hover:text-fg"
      } ${className}`}
      {...rest}
    >
      <Icon name={icon} />
      {shown && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-spore px-1 text-[10px] leading-4 text-spore-ink"
        >
          {badge}
        </span>
      )}
      {shown && badgeLabel && (
        <span id={said} hidden>
          {badgeLabel}
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
  bell: "M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9M10.2 20.5a2 2 0 0 0 3.6 0",
  build: "M14 3l7 7M17.5 6.5L9 15M9 15l-4.5 4.5a2.1 2.1 0 0 1-3-3L6 12zM6 12l3 3",
  external: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  lens: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5h.01",
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
 * A surface beside the map: on a desktop a column at the left, under the HUD; on a phone a bottom sheet over the tab bar.
 * Escape closes it unless something has already taken the key (the map unfollowing, the Go to menu closing: they
 * preventDefault) or something above it is open (a tooltip, the Codex). Closing it gives focus back to
 * what had it when it opened (its rail button).
 */
export function Drawer({
  label,
  title,
  onClose,
  children,
  wide = false,
}: {
  label: string;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** wider on a large screen (the Mutations drawer's tree) */
  wide?: boolean;
}) {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      if (opener?.isConnected && (document.activeElement === document.body || document.activeElement === null)) opener.focus();
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="tooltip"], [role="dialog"][aria-label="Codex"]')) return;
      onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <section
      aria-label={label}
      className={`panel-in pointer-events-auto absolute inset-x-2 bottom-16 z-10 flex max-h-[min(62dvh,calc(100%-9rem))] flex-col sm:inset-x-auto sm:top-[4.5rem] sm:bottom-3 sm:left-16 sm:max-h-none ${wide ? "sm:w-[22rem] lg:w-[32rem]" : "sm:w-[22rem]"} ${FLOAT}`}
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

/**
 * A dialog over the whole page (the command palette, the shortcuts sheet): focus moves into it (its first field, or the
 * panel) and goes back to what had it when it closes; Tab stays inside; Escape closes it first (in the capture phase, so
 * a drawer or a follow under it stays), and so does a press on the backdrop.
 */
export function Modal({
  label,
  onClose,
  children,
  className = "",
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (panel.current?.querySelector<HTMLElement>("input, textarea") ?? panel.current)?.focus({ preventScroll: true });
    return () => {
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === "Tab" && panel.current) {
        const all = [...panel.current.querySelectorAll<HTMLElement>("button, input, textarea, a[href], [tabindex='0']")].filter(
          (el) => !el.hasAttribute("disabled"),
        );
        if (!all.length) return;
        const first = all[0]!;
        const last = all[all.length - 1]!;
        if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 px-4 pt-[10dvh]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`flex max-h-[75dvh] w-full max-w-xl flex-col overflow-hidden outline-none ${FLOAT} ${className}`}
      >
        {children}
      </div>
    </div>
  );
}

/** A key, as the shortcuts sheet and the palette show it. */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-grid min-w-6 place-items-center rounded border border-line-strong bg-raised px-1.5 py-0.5 font-mono text-[11px] leading-none text-fg-2">
      {children}
    </kbd>
  );
}
