// The page's game journal (ja-8tb, colony/journal.ts): off unless the URL asks, `?log=summary`, `?log=detail`,
// `?log=verbose,ant=42`, `?log=death,mode,colony=0`. Every event it keeps goes to the browser console at the debug
// level (DevTools shows it under "Verbose") and to the Journal card in Details.
import { formatJournalEvent, Journal, type JournalEvent } from "../colony/index.ts";
import { colonyName } from "./names.ts";

/** The newest events the page keeps for the card; the console has them all. */
const PAGE_LIMIT = 2000;

/** The journal `?log=` asks for, or null. A spec it can't read is said in the console, not thrown. */
export function journalFromUrl(search: string = typeof location === "undefined" ? "" : location.search): Journal | null {
  const spec = new URLSearchParams(search).get("log");
  if (spec === null) return null;
  try {
    const j = new Journal(spec, PAGE_LIMIT);
    if (!j.on) return null;
    j.subscribe((e) => console.debug(journalLine(e), ...(e.data ? [e.data] : [])));
    console.info(
      `[journal] on: ${[...j.filter.categories].join(", ")}${j.filter.colony !== undefined ? `, colony ${j.filter.colony}` : ""}${j.filter.ant !== undefined ? `, ant ${j.filter.ant}` : ""}`,
    );
    return j;
  } catch (e) {
    console.warn(`[journal] ?log=${spec}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** One event as the page shows it: the colony by its name. */
export function journalLine(e: JournalEvent): string {
  return formatJournalEvent(e).replace(/\bc(\d+)\b/, (_, k: string) => colonyName(Number(k)));
}
