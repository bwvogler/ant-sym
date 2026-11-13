// Jev's answers shipped with the page (the fungus game, ja-lo8.3): scripts/precache.mjs asks every situation of the
// browser's lanes under each preset doctrine and writes them to public/precache/. At start the page fetches them and
// seeds the Jev client's caches (ColonyJev.seed), under any answer this browser already has. So the first game plays
// Jev's answers from its first second, and the Pages build, with no server, plays them too.

/** One shipped bundle: a lane's answers under one doctrine's context. */
export interface PrecacheBundle {
  lane: string;
  /** the preset doctrine (mode, stance) or aim (fungus) it was asked under */
  doctrine?: string;
  aim?: string;
  /** the species whose own lane words it was asked under (ja-rf5.9); absent: the generic ant's */
  species?: string;
  context: string;
  file: string;
  answers: number;
}

export interface PrecacheIndex {
  bundles: PrecacheBundle[];
  versions: Record<string, number>;
}

/** The URL of a shipped file under the app's base path (`/` in dev, `/ant-sym/` on Pages). */
export function precacheUrl(file: string, base: string = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/"): string {
  return `${base.endsWith("/") ? base : `${base}/`}precache/${file}`;
}

function isPairs(v: unknown): v is [string, string][] {
  return Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && typeof e[1] === "string");
}

/**
 * Fetch the index and every bundle, and hand each to `seed(context, entries)`. A missing or malformed file is skipped:
 * the page plays on without it. Returns the answers seeded.
 */
export async function loadPrecache(
  seed: (context: string, entries: [string, string][]) => number,
  fetchFn: typeof fetch = fetch,
  base?: string,
): Promise<number> {
  let index: PrecacheIndex;
  try {
    const res = await fetchFn(precacheUrl("index.json", base));
    if (!res.ok) return 0;
    index = (await res.json()) as PrecacheIndex;
    if (!Array.isArray(index?.bundles)) return 0;
  } catch {
    return 0;
  }
  const counts = await Promise.all(
    index.bundles.map(async (b) => {
      try {
        const res = await fetchFn(precacheUrl(b.file, base));
        if (!res.ok) return 0;
        const entries = (await res.json()) as unknown;
        return isPairs(entries) ? seed(b.context, entries) : 0;
      } catch {
        return 0;
      }
    }),
  );
  return counts.reduce((a, n) => a + n, 0);
}
