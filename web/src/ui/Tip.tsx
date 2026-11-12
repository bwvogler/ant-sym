import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { place, type Placement } from "./tipPosition.ts";

/**
 * A tooltip that explains something at more length than a `title` can: shown on hover and on keyboard focus, closed by
 * Escape, and placed so it stays in the window. `tip` is the content; the children are what it explains. The anchor takes
 * focus (tabIndex 0) so a keyboard user reaches it, and describes itself by the tip.
 */
export default function Tip({ tip, children, className = "" }: { tip: ReactNode; children: ReactNode; className?: string }) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<Placement | null>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    setAt(null);
  }, []);

  // Place it once it has a size, before it paints.
  useLayoutEffect(() => {
    if (!open || !anchor.current || !bubble.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    setAt(place(a, { width: b.width, height: b.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, [open, tip]);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", key);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("scroll", hide, true);
    };
  }, [open, hide]);

  return (
    <span
      ref={anchor}
      tabIndex={0}
      className={`cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-accent ${className}`}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
          className="pointer-events-none z-50 block w-72 max-w-[calc(100vw-16px)] rounded-md border border-line-strong bg-raised px-3 py-2 text-left text-[11px] leading-snug font-normal whitespace-normal text-fg shadow-lg"
        >
          {tip}
        </span>
      )}
    </span>
  );
}
