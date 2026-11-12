import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { place, type Placement } from "./tipPosition.ts";

/**
 * A tooltip that explains something at more length than a `title` can. A mouse opens it by hovering; a keyboard by
 * focusing it (Tab); a finger by tapping it, which toggles it, and a tap anywhere else closes it. Escape closes it. It
 * is placed so it stays in the window and follows its anchor when the page scrolls or resizes. `tip` is the content; the
 * children are what it explains. The anchor takes focus (tabIndex 0) and describes itself by the tip; a dotted underline
 * marks what has one. `tapToOpen` false (for a button, whose tap must do its own job) leaves touch to open it no other way.
 */
export default function Tip({
  tip,
  children,
  className = "",
  dotted = true,
  tapToOpen = true,
  tabStop = true,
}: {
  tip: ReactNode;
  children: ReactNode;
  className?: string;
  dotted?: boolean;
  tapToOpen?: boolean;
  /** false: not a stop on the Tab order (a button inside it is one already) */
  tabStop?: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const pointer = useRef<string>("mouse");
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<Placement | null>(null);

  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => {
    setOpen(false);
    setAt(null);
  }, []);

  const placeIt = useCallback(() => {
    if (!anchor.current || !bubble.current) return;
    const a = anchor.current.getBoundingClientRect();
    const b = bubble.current.getBoundingClientRect();
    setAt(place(a, { width: b.width, height: b.height }, { width: window.innerWidth, height: window.innerHeight }));
  }, []);

  // Place it once it has a size, before it paints.
  useLayoutEffect(() => {
    if (open) placeIt();
  }, [open, tip, placeIt]);

  // Open: Escape closes; a tap outside closes; the page scrolling or resizing moves it with its anchor.
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const outside = (e: PointerEvent) => {
      if (!anchor.current?.contains(e.target as Node)) hide();
    };
    window.addEventListener("keydown", key);
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", placeIt, true);
    window.addEventListener("resize", placeIt);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", placeIt, true);
      window.removeEventListener("resize", placeIt);
    };
  }, [open, hide, placeIt]);

  return (
    <span
      ref={anchor}
      tabIndex={tabStop ? 0 : -1}
      className={`cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-accent ${dotted ? "underline decoration-fg-3 decoration-dotted underline-offset-2" : ""} ${className}`}
      aria-describedby={open ? id : undefined}
      onPointerDown={(e) => (pointer.current = e.pointerType)}
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={(e) => e.pointerType === "mouse" && hide()}
      // Focus from the keyboard opens it; a tap focuses too, but a tap is handled by its click below.
      onFocus={(e) => (e.target as Element).matches(":focus-visible") && show()}
      onBlur={hide}
      onClick={(e) => tapToOpen && pointer.current !== "mouse" && !bubble.current?.contains(e.target as Node) && setOpen((o) => !o)}
    >
      {children}
      {open && (
        <span
          ref={bubble}
          id={id}
          role="tooltip"
          style={{ position: "fixed", left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
          className="z-50 block max-h-[calc(100vh-16px)] w-72 max-w-[calc(100vw-16px)] cursor-auto overflow-y-auto overscroll-contain rounded-md border border-line-strong bg-raised px-3 py-2 text-left text-[11px] leading-snug font-normal whitespace-normal text-fg shadow-lg"
        >
          {tip}
        </span>
      )}
    </span>
  );
}
