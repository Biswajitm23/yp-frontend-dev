import "server-only";

// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
//
// Runtime backend base-URL resolver. During the temporary VM -> Cloud Run
// migration the app asks a public switch endpoint which backend to use, instead
// of reading one hardcoded BACKEND_URL. ALL of this behaviour is contained in
// this single file so it can be deleted cleanly after cutover (see
// docs/SERVER_SWITCH_MIGRATION.md for the exact revert steps).
//
// Model A — ALWAYS ask SERVER_1 (old) first; only fall back to SERVER_2 (new)
// when SERVER_1 does not answer. The flag SERVER_1 returns decides which base
// URL every backend call uses:
//   data.server === true             -> use the server we asked  (stay)
//   data.server === false            -> use the OTHER server      (switch)
//   data.server === "server 1" / "1" -> use SERVER_1 (old)   [legacy string form]
//   data.server === "server 2" / "2" -> use SERVER_2 (new)   [legacy string form]
//   missing / unrecognised / error   -> treated as "no answer"
//
// The resolved URL is cached in server memory for SWITCH_TTL_MS so the switch
// endpoint is not hit on every request, and the last good value is reused if
// both servers go quiet. Nothing here is ever exposed to the browser — this is
// a server-only module and the URLs come from server-only env vars.

const SWITCH_PATH = "/api/web/server-switch";
const SWITCH_TIMEOUT_MS = 3000;
const SWITCH_TTL_MS = 60_000;

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

// server-only env (never NEXT_PUBLIC_*). SERVER_1 falls back to the original
// BACKEND_URL so a missing SERVER_1 can never break the app.
const SERVER_1 = stripTrailingSlash(
  process.env.SERVER_1 || process.env.BACKEND_URL || "",
);
const SERVER_2 = stripTrailingSlash(process.env.SERVER_2 || "");

type Resolved = { url: string; expiresAt: number };

// Module-memory cache (per server instance). `lastKnownGood` survives past the
// TTL so a total outage reuses the last working URL instead of guessing.
let cached: Resolved | null = null;
let lastKnownGood: string | null = null;
let inFlight: Promise<string> | null = null;

/**
 * Interpret a switch response's `data.server`, relative to which server we
 * asked. Returns the chosen base URL, or null when the value is unusable.
 */
function interpretServerValue(value: unknown, askedUrl: string): string | null {
  const otherUrl = askedUrl === SERVER_1 ? SERVER_2 : SERVER_1;

  // boolean: relative to the server we asked (true = stay, false = switch)
  if (value === true) return askedUrl;
  if (value === false) return otherUrl || askedUrl;

  // string: absolute ("server 1" / "server 2", also "server2" / "1" / "2")
  if (typeof value === "string") {
    if (/2/.test(value)) return SERVER_2 || askedUrl;
    if (/1/.test(value)) return SERVER_1 || askedUrl;
  }

  return null;
}

/** Ask a single server's switch endpoint. Returns the chosen URL or null. */
async function askServer(baseUrl: string): Promise<string | null> {
  if (!baseUrl) return null;
  try {
    const res = await fetch(`${baseUrl}${SWITCH_PATH}`, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(SWITCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as
      | { data?: { server?: unknown } }
      | null;
    if (!body || typeof body !== "object") return null;
    return interpretServerValue(body.data?.server, baseUrl);
  } catch {
    // timeout / network error / bad JSON — treated as "no answer"
    return null;
  }
}

async function resolve(): Promise<string> {
  // 1. Ask SERVER_1 (old) first — it is the migration control switch.
  let chosen = await askServer(SERVER_1);

  // 2. SERVER_1 gave no usable answer -> ask SERVER_2 (new) as a backup.
  if (!chosen) chosen = await askServer(SERVER_2);

  // 3. Neither answered -> reuse last-known-good, else default to SERVER_1.
  if (!chosen) chosen = lastKnownGood || SERVER_1;

  // 4. Remember the choice (survives the TTL as last-known-good).
  lastKnownGood = chosen;
  cached = { url: chosen, expiresAt: Date.now() + SWITCH_TTL_MS };
  return chosen;
}

/**
 * The single source of truth for the backend base URL. Every server-side
 * backend call reads this. Cached for SWITCH_TTL_MS; concurrent cache-misses
 * are collapsed into one resolution so the switch endpoint is never stampeded.
 */
export async function getBackendUrl(): Promise<string> {
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  if (!inFlight) {
    inFlight = resolve().finally(() => {
      inFlight = null;
    });
  }
  return inFlight;
}

// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
/**
 * Numeric code for the backend the switch currently resolves to, for the
 * `server` field the session endpoints (login / signup / verify-otp /
 * social-login / heartbeat) send in their request body:
 *   0 = SERVER_1 (old)   1 = SERVER_2 (new)
 * Reads the SAME cached choice getBackendUrl() uses, so it never fires an extra
 * switch call and always agrees with the URL the request is actually sent to.
 * Anything that is not SERVER_2 counts as 0 — matching the backend's "missing = 0".
 */
export async function getBackendServerCode(): Promise<0 | 1> {
  const url = await getBackendUrl();
  return SERVER_2 && url === SERVER_2 ? 1 : 0;
}
