import "server-only";

// src/lib/api.ts
//
// The single server-side gateway (D2). Every read (Server Component) and write
// (Server Action) goes through `api.*`. Responsibilities centralised here:
//   - read the httpOnly `access` cookie and attach `Authorization: Bearer`
//   - uniform `{ status, code?, message?, data }` envelope (NFR4)
//   - bounded fetch timeout + retry (NFR3)
//   - inline refresh + cookie rotation on 401 (D5) — never exposes tokens to JS
//   - NEVER logs a token or a body that may contain one (NFR1)
//
// server-only: importing this from a Client Component is a build error.

import { cookies, headers } from "next/headers";
import {
  clearAuthCookies,
  isProfileCompletedIn,
  setAuthCookies,
  type CookieStore,
  type ReadableCookieStore,
} from "@/lib/authCookies";
import {
  ACCOUNT_INACTIVE_CODE,
  ACCOUNT_INACTIVE_MESSAGE,
  isAccountInactiveResponse,
} from "@/lib/accountStatus";
import {
  buildClientHeaders,
  type ReadableCookieStore as ClientMetaCookieStore,
  type ReadableHeaders,
} from "@/lib/clientMeta";
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
import { getBackendUrl } from "@/lib/backendUrl";

// const BASE = process.env.BACKEND_URL!; // server-only; never NEXT_PUBLIC_*  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover (restore this line; BASE is now resolved at call time via getBackendUrl())

// Backend refresh contract — mirrors src/app/api/auth/refresh/route.ts:
//   POST ${BACKEND}/api/mobile/auth/token/refresh  body { refresh_token }
//   success -> { status, data: { access_token, refresh_token, expires_in? } }
const REFRESH_ENDPOINT = "/api/mobile/auth/token/refresh";

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;

export type AuthMode = "strict" | "soft" | "none";

export interface ApiResult<T> {
  status: "OK" | "ERROR";
  code?: string;
  message?: string;
  data: T | null;
}

interface Opts {
  auth?: AuthMode;
  query?: Record<string, string | number | undefined>;
  timeoutMs?: number;
  retries?: number;
  cache?: RequestCache;
}

/** Build a `?a=b&c=d` query string, skipping undefined values. */
function qs(query?: Opts["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) params.append(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * Client identity for an outbound backend call: the device id out of the cookie
 * jar, plus the BROWSER's own User-Agent and forwarded IP.
 *
 * Forwarding the latter two is what makes the backend's `ip_address` /
 * `user_agent` columns mean anything: this app is a BFF, so left alone the
 * backend would record THIS server's address and undici's user agent on every
 * UserSession row.
 *
 * Both sources are best-effort. `headers()` throws outside a request scope (a
 * build-time prerender has no browser behind it at all); the call then still
 * reports platform and version and the backend falls back for the rest.
 */
async function clientMetaHeaders(
  jar: CookieStore,
): Promise<Record<string, string>> {
  let requestHeaders: ReadableHeaders | null = null;
  try {
    requestHeaders = (await headers()) as unknown as ReadableHeaders;
  } catch {
    requestHeaders = null;
  }
  return buildClientHeaders(
    jar as unknown as ClientMetaCookieStore,
    requestHeaders,
  );
}

/**
 * fetch with an AbortController timeout and bounded retry on network errors or
 * 5xx responses. A 4xx (incl. 401) is NOT retried here — 401 handling/refresh is
 * done by the caller so it can rotate cookies first.
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  retries: number,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      clearTimeout(timer);
      if (res.status >= 500 && attempt < retries) {
        continue; // transient upstream error — retry
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) continue; // network error / abort — retry
      throw err;
    }
  }
  // Unreachable in practice (loop either returns or throws), but satisfies TS.
  throw lastErr ?? new Error("fetchWithTimeout: exhausted retries");
}

/**
 * Refresh the access token using the httpOnly `refresh` cookie and, when cookies
 * are WRITABLE (Server Action / Route Handler), rotate them via setAuthCookies
 * and return the new access token.
 *
 * In a Server Component render the `cookies()` jar is READ-ONLY, so `.set()`
 * throws — we catch and return null; the next navigation's middleware refresh
 * recovers. Returns null on any failure.
 */
async function refreshInline(
  jar: CookieStore,
  clientHeaders: Record<string, string>,
): Promise<string | null> {
  const refreshToken = (jar as unknown as {
    get(name: string): { value: string } | undefined;
  }).get("refresh")?.value;
  if (!refreshToken) return null;

  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
  const BASE = await getBackendUrl();

  let res: Response;
  try {
    res = await fetchWithTimeout(
      `${BASE}${REFRESH_ENDPOINT}`,
      {
        method: "POST",
        headers: { ...clientHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        cache: "no-store",
      },
      DEFAULT_TIMEOUT_MS,
      0,
    );
  } catch {
    return null;
  }

  if (!res.ok) return null;

  const payload = (await res.json().catch(() => null)) as {
    data?: {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
  } | null;

  const newAccess = payload?.data?.access_token;
  if (!newAccess) return null;

  try {
    // Writable only in an Action/Route — throws during a Server Component render.
    setAuthCookies(jar, {
      access: newAccess,
      refresh: payload?.data?.refresh_token ?? refreshToken,
      expiresIn: payload?.data?.expires_in,
      // Keep a half-onboarded login session-scoped across rotations, so it
      // still ends when the browser closes (see setAuthCookies.sessionOnly).
      sessionOnly: !isProfileCompletedIn(jar as unknown as ReadableCookieStore),
    });
  } catch {
    // Read-only cookie context (render): can't rotate. The new token is still
    // usable for the in-flight retry; middleware refreshes on next navigation.
  }

  return newAccess;
}

async function call<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  opts: Opts = {},
): Promise<ApiResult<T>> {
  const jar = (await cookies()) as unknown as CookieStore;
  const clientHeaders = await clientMetaHeaders(jar);
  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
  const BASE = await getBackendUrl();
  let token = (jar as unknown as {
    get(name: string): { value: string } | undefined;
  }).get("access")?.value;

  if (opts.auth === "strict" && !token) {
    // Try an inline refresh first (only succeeds in an Action/Route); if still
    // no token, return UNAUTHENTICATED WITHOUT hitting the network.
    token = (await refreshInline(jar, clientHeaders)) ?? undefined;
    if (!token) {
      return {
        status: "ERROR",
        code: "UNAUTHENTICATED",
        message: "Login required",
        data: null,
      };
    }
  }

  const isForm = body instanceof FormData;

  const run = (bearer?: string) =>
    fetchWithTimeout(
      `${BASE}${endpoint}${qs(opts.query)}`,
      {
        method,
        headers: {
          // Spread FIRST so a caller's Authorization / Content-Type always wins.
          ...clientHeaders,
          ...(bearer && opts.auth !== "none"
            ? { Authorization: `Bearer ${bearer}` }
            : {}),
          ...(!isForm && body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        },
        body: isForm
          ? (body as FormData)
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
        cache: opts.cache ?? "no-store",
      },
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      opts.retries ?? DEFAULT_RETRIES,
    );

  let res: Response;
  try {
    res = await run(token);
  } catch {
    // Network failure / timeout after retries.
    return { status: "ERROR", message: "Network error", data: null };
  }

  // Access expired mid-call -> rotate the httpOnly cookie and retry ONCE.
  if (res.status === 401 && opts.auth !== "none") {
    const fresh = await refreshInline(jar, clientHeaders);
    if (fresh) {
      token = fresh;
      try {
        res = await run(fresh);
      } catch {
        return { status: "ERROR", message: "Network error", data: null };
      }
    }
  }

  // NEVER console.log the token or a body that may contain it.
  const data = (await res.json().catch(() => null)) as
    | (T & { message?: string })
    | { message?: string }
    | null;

  if (res.ok) {
    return { status: "OK", data: (data as T) ?? null };
  }

  const message =
    (data as { message?: string } | null)?.message ?? "Upstream error";

  // The identity behind these cookies is GONE — the account was deleted /
  // deactivated / suspended in the backend. A refresh can never repair that, so
  // kill the cookies right here. If we don't, /api/auth/has-session keeps
  // answering `authenticated: true`, every gated query stays enabled and re-fires
  // against a dead token, and the page loops on failing requests forever.
  // `auth:"none"` never attaches the bearer, so the backend can't be talking
  // about THIS account — excluded so it can't tear down a healthy session.
  if (token && opts.auth !== "none" && isAccountInactiveResponse(res.status, message)) {
    try {
      clearAuthCookies(jar);
    } catch {
      // Read-only jar (Server Component render) — can't rotate here. The client
      // handler (handleAccountInactive) clears them via /api/auth/logout.
    }

    // Reported for EVERY auth mode, including soft/none. Serving those endpoints
    // their anonymous payload instead would be friendlier in isolation, but it
    // hides the signal: whichever call happens to run first would silently clear
    // the cookies, and the calls behind it would then see "no token" and report
    // UNAUTHENTICATED — leaving the user half-logged-out on a stale page. One
    // deterministic outcome is worth more than a feed render we're about to
    // navigate away from.
    return {
      status: "ERROR",
      code: ACCOUNT_INACTIVE_CODE,
      message: ACCOUNT_INACTIVE_MESSAGE,
      data: null,
    };
  }

  // A real 401 that survived the refresh attempt: tag it so gated call sites can
  // open the login gate (never a force-logout — REQUIREMENTS §5 R4).
  if (res.status === 401) {
    return { status: "ERROR", code: "UNAUTHENTICATED", message, data: null };
  }

  return { status: "ERROR", message, data: null };
}

export const api = {
  get: <T>(e: string, o?: Opts) => call<T>("GET", e, undefined, o),
  post: <T>(e: string, b?: unknown, o?: Opts) => call<T>("POST", e, b, o),
  put: <T>(e: string, b?: unknown, o?: Opts) => call<T>("PUT", e, b, o),
  del: <T>(e: string, b?: unknown, o?: Opts) => call<T>("DELETE", e, b, o),
  postForm: <T>(e: string, f: FormData, o?: Opts) => call<T>("POST", e, f, o),
};
