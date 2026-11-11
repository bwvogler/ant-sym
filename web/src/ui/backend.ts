import { PASS_HEADER, readHealth, type Budget } from "../../shared/jev.ts";
export { PASS_HEADER };

// Where the API is. In dev it is middleware on the Vite server, same origin.
// A static build (GitHub Pages: main and the PR previews) has none of its own:
// built with VITE_JEV_API it talks to the hosted proxy (web/worker, behind a
// passphrase, docs/hosting.md); built without, it has no backend and plays the
// answers Jev already gave.

type ViteEnv = { BASE_URL?: string; VITE_JEV_API?: string };
const viteEnv = (): ViteEnv => (import.meta as { env?: ViteEnv }).env ?? {};

/** The hosted proxy's origin baked into this build, or null (dev server, or no backend). */
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

const PASS_KEY = "jev-ants:pass";
/** Kept for this page when localStorage is blocked. */
let memoryPass: string | null = null;

/** The passphrase this browser keeps for the hosted proxy, or null. */
export function passphrase(): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(PASS_KEY) ?? memoryPass;
  } catch {
    // blocked storage: fall back to this page's copy
  }
  return memoryPass;
}

export function setPassphrase(p: string | null): void {
  memoryPass = p;
  try {
    if (p) localStorage.setItem(PASS_KEY, p);
    else localStorage.removeItem(PASS_KEY);
  } catch {
    // blocked storage: memoryPass holds it until the page closes
  }
}

/** Headers for an API call: JSON, plus the passphrase when the build talks to the hosted proxy. */
export function apiHeaders(env: ViteEnv = viteEnv(), pass: string | null = passphrase()): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (hostedApi(env) && pass) h[PASS_HEADER] = pass;
  return h;
}

export interface Backend {
  hasBackend: boolean;
  hasKey: boolean;
  /** today's spend against the server's daily budget when the page loaded (PR #42 review S8), if the server says */
  budget?: Budget;
  /** The hosted proxy answered but refuses calls until this browser gives the passphrase. Absent otherwise. */
  needsPass?: true;
}

/** Ask /api/health. Anything but a JSON `{ok: true}` (404 page, network error) means no backend. */
export async function detectBackend(
  fetchFn: typeof fetch = fetch,
  env: ViteEnv = viteEnv(),
  pass: string | null = passphrase(),
): Promise<Backend> {
  try {
    // The passphrase goes on the probe too: an unlocked browser is only told so if it says the passphrase here.
    const res = await fetchFn(apiUrl("api/health", env), { headers: apiHeaders(env, pass) });
    if (!res.ok) return { hasBackend: false, hasKey: false };
    const body = readHealth(await res.json());
    if (!body) return { hasBackend: false, hasKey: false };
    const budget = body.budget;
    const needsPass = body.hosted === true && body.authorized !== true;
    return { hasBackend: true, hasKey: body.hasKey, ...(budget ? { budget } : {}), ...(needsPass ? { needsPass } : {}) };
  } catch {
    return { hasBackend: false, hasKey: false };
  }
}

/** True once the probe has answered and there is no backend (the static demo). */
export function isDemo(b: Backend | null): boolean {
  return b !== null && !b.hasBackend;
}
