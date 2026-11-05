// Where the API is. In dev it is middleware on the Vite server, same origin.
// A static build (GitHub Pages: main and the PR previews) has none of its own:
// built with VITE_JEV_API it talks to the hosted proxy (web/worker, behind a
// passphrase, docs/hosting.md); built without, it is the demo and Jev is off.

type ViteEnv = { BASE_URL?: string; VITE_JEV_API?: string };
const viteEnv = (): ViteEnv => (import.meta as { env?: ViteEnv }).env ?? {};

/** The hosted proxy's origin baked into this build, or null (dev server, or the demo). */
export function hostedApi(env: ViteEnv = viteEnv()): string | null {
  const u = env.VITE_JEV_API?.trim();
  return u ? u.replace(/\/+$/, "") : null;
}

/** The URL of an API route: the hosted proxy when the build names one, else under the app's base path (`/` in dev). */
export function apiUrl(path: string, env: ViteEnv = viteEnv()): string {
  const rel = path.replace(/^\/+/, "");
  const hosted = hostedApi(env);
  if (hosted) return `${hosted}/${rel}`;
  const base = env.BASE_URL ?? "/";
  return `${base.endsWith("/") ? base : `${base}/`}${rel}`;
}

/** Sent to the hosted proxy; must match web/worker/gate.ts PASS_HEADER. Not the Jev key, which never reaches the browser. */
export const PASS_HEADER = "x-jev-ants-pass";
const PASS_KEY = "jev-ants:pass";

/** The passphrase this browser keeps for the hosted proxy. Storage can be blocked: then there is none. */
export function passphrase(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(PASS_KEY);
  } catch {
    return null;
  }
}

export function setPassphrase(p: string | null): void {
  try {
    if (p) localStorage.setItem(PASS_KEY, p);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    // blocked storage: the passphrase lasts until reload via the in-memory fallback
  }
  memoryPass = p;
}
let memoryPass: string | null = null;

/** Headers for an API call: JSON, plus the passphrase when the build talks to the hosted proxy. */
export function apiHeaders(env: ViteEnv = viteEnv(), pass: string | null = passphrase() ?? memoryPass): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (hostedApi(env) && pass) h[PASS_HEADER] = pass;
  return h;
}

export interface Backend {
  hasBackend: boolean;
  hasKey: boolean;
  /** The hosted proxy answered but refuses calls until this browser gives the passphrase. */
  needsPass: boolean;
}

/** Ask /api/health. Anything but a JSON `{ok: true}` (404 page, network error) means no backend. */
export async function detectBackend(fetchFn: typeof fetch = fetch): Promise<Backend> {
  const none = { hasBackend: false, hasKey: false, needsPass: false };
  try {
    const res = await fetchFn(apiUrl("api/health"), { headers: apiHeaders() });
    if (!res.ok) return none;
    const body = (await res.json()) as { ok?: unknown; hasKey?: unknown; hosted?: unknown; authorized?: unknown };
    if (body?.ok !== true) return none;
    return { hasBackend: true, hasKey: body.hasKey === true, needsPass: body.hosted === true && body.authorized !== true };
  } catch {
    return none;
  }
}

/** True once the probe has answered and there is no backend (the static demo). */
export function isDemo(b: Backend | null): boolean {
  return b !== null && !b.hasBackend;
}

/** Why Start Jev is unavailable for want of a backend, key or passphrase, or null. */
export function jevUnavailable(b: Backend | null): string | null {
  if (b === null) return "Checking for the Jev server…";
  if (!b.hasBackend) return "Demo build: Jev needs the local server and a JEV_API_KEY. Ants run on the local rule here.";
  if (b.needsPass) return "Enter the passphrase to let Jev steer the ants on this page";
  if (!b.hasKey) return "JEV_API_KEY is not set in the server's environment";
  return null;
}
