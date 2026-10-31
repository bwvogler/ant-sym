// Class strings shared by the panels.

/** One button of a segmented control; the active one takes the accent. */
export function seg(active: boolean): string {
  return `px-3 py-1.5 ${active ? "bg-accent text-accent-ink" : "bg-panel text-fg-2 hover:bg-raised"} disabled:cursor-not-allowed disabled:opacity-60`;
}
