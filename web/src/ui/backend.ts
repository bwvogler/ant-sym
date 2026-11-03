
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
}

/** Ask /api/health. Anything but a JSON `{ok: true}` (404 page, network error) means no backend. */
export async function detectBackend(fetchFn: typeof fetch = fetch): Promise<Backend> {
  try {
    const res = await fetchFn(apiUrl("api/health"));
    if (!res.ok) return { hasBackend: false, hasKey: false };
    const body = (await res.json()) as { ok?: unknown; hasKey?: unknown };
    if (body?.ok !== true) return { hasBackend: false, hasKey: false };
    return { hasBackend: true, hasKey: body.hasKey === true };
  } catch {
    return { hasBackend: false, hasKey: false };
  }
}

/** Why Start Jev is unavailable for want of a backend or key, or null. */
export function jevUnavailable(b: Backend | null): string | null {
  if (b === null) return null; // still asking: the click itself reports any failure
  if (!b.hasBackend) return "Demo build: Jev needs the local server and a JEV_API_KEY. Ants run on the local rule here.";
  if (!b.hasKey) return "JEV_API_KEY is not set in the server's environment";
  return null;
}
