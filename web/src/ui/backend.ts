import type { Budget } from "../../shared/jev.ts";


// The API is dev-server middleware, so a static build (the GitHub Pages demo)
// has no backend: Jev is unavailable, everything else runs in the browser.

/** The URL of an API route, under the app's base path (`/` in dev, `/ant-sym/` on Pages). */
export function apiUrl(path: string): string {
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}${path.replace(/^\/+/, "")}`;
}

export interface Backend {
  hasBackend: boolean;
  hasKey: boolean;
  /** today's spend against the server's daily budget when the page loaded (PR #42 review S8), if the server says */
  budget?: Budget;
}

/** Ask /api/health. Anything but a JSON `{ok: true}` (404 page, network error) means no backend. */
export async function detectBackend(fetchFn: typeof fetch = fetch): Promise<Backend> {
  try {
    const res = await fetchFn(apiUrl("api/health"));
    if (!res.ok) return { hasBackend: false, hasKey: false };
    const body = (await res.json()) as { ok?: unknown; hasKey?: unknown; run?: { budget?: Budget } };
    if (body?.ok !== true) return { hasBackend: false, hasKey: false };
    const budget = body.run?.budget;
    return { hasBackend: true, hasKey: body.hasKey === true, ...(budget ? { budget } : {}) };
  } catch {
    return { hasBackend: false, hasKey: false };
  }
}

/** True once the probe has answered and there is no backend (the static demo). */
export function isDemo(b: Backend | null): boolean {
  return b !== null && !b.hasBackend;
}
