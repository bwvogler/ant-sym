// The hosted proxy's front door, pure so node --test covers it (the Worker in
// index.ts is wiring). The Vite middleware refuses every cross-origin request
// (server/api.ts `sameOrigin`); this proxy serves a page on another origin
// (GitHub Pages), so it does the opposite: only the listed origins, plus a
// passphrase, because a public page with a key behind it is anyone's to spend.

import { PASS_HEADER } from "../shared/jev.ts";
export { PASS_HEADER };

/** "https://a.example, https://b.example" → exact origins, no trailing slashes. */
export function parseOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/+$/, ""))
    .filter(Boolean);
}

/**
 * Who may call. A browser always sends Origin on a cross-origin fetch, so a
 * foreign page is refused here. No Origin (curl, a script) is let through to
 * the passphrase check: the passphrase, not the origin, is the lock.
 */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  return origin === null || allowed.includes(origin);
}

/** CORS headers for an allowed origin; none for a request without one. */
export function corsHeaders(origin: string | null, allowed: string[]): Record<string, string> {
  if (origin === null || !allowed.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": `content-type, ${PASS_HEADER}`,
    "access-control-max-age": "7200",
    vary: "Origin",
  };
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

/** Does the sent passphrase match? Fails closed: no passphrase configured means nobody gets in. Compares digests in constant time. */
export async function passOk(sent: string | null, expected: string | undefined): Promise<boolean> {
  if (!expected || !sent) return false;
  const [a, b] = await Promise.all([sha256(sent), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] as number) ^ (b[i] as number);
  return diff === 0;
}
