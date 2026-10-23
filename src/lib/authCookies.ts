// src/lib/authCookies.ts
//
// Single source of truth for issuing/clearing the httpOnly auth cookies.
// Replaces the 5 inconsistent issuers (src/auth.ts, auth/login, auth/verify,
// auth/refresh, auth/social-login) whose maxAge ranged over {session, 60s, 24h,
// 7d} — see API_AND_AUTH_REVIEW Part A.4 / migration-map cookieIssuers[].
//
// Decision D7: cookie maxAge is derived from the REAL token TTL — preferring a
// backend-provided `expires_in` (seconds), else the JWT `exp` claim — instead of
// a hardcoded lifetime.
//
// `store` is any cookie store exposing `.set()` / `.delete()`. Both the awaited
// `cookies()` jar from `next/headers` (ReadonlyRequestCookies) and a
// `NextResponse`'s `.cookies` (ResponseCookies) share the same set/delete
// signatures (ReadonlyRequestCookies picks them straight from ResponseCookies),
// so a single structural type works for both call sites.

/** Cookie names — must match the existing app (see auth/login, auth/refresh, auth/verify). */
export const ACCESS_COOKIE = "access" as const;
export const REFRESH_COOKIE = "refresh" as const;
export const PROFILE_COMPLETED_COOKIE = "profile_completed" as const;
/**
 * The backend UserSession row this browser session belongs to (see
 * src/lib/userSession.ts). httpOnly on purpose: the future heartbeat is a BFF
 * route that reads the cookie itself, so client JS never needs to hold the id
 * and cannot forge one.
 */
export const SESSION_ID_COOKIE = "yp_session_id" as const;
/**
 * How the current login was made: "system" (email/phone + password) or
 * "social" (Google / LinkedIn / Apple). Client-readable on purpose — it only
 * drives UI (e.g. whether Change Password asks for the current password); the
 * backend remains the authority on what a request must contain.
 */
export const LOGIN_TYPE_COOKIE = "login_type" as const;
export type LoginType = "system" | "social";

/** ~80 years — only for the COMPLETED state, which must survive a browser restart. */
const PROFILE_COMPLETED_MAX_AGE = 1000 * 60 * 60 * 24 * 365 * 80;

/** Fallback access-cookie maxAge (seconds) when no TTL can be derived. */
const DEFAULT_ACCESS_MAX_AGE = 60 * 60; // 1h
/** Fallback refresh-cookie maxAge (seconds) when no TTL can be derived. */
const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7d
/**
 * The session id is only useful while the login it belongs to is alive, so it
 * tracks the refresh cookie's lifetime rather than inventing its own.
 */
const DEFAULT_SESSION_ID_MAX_AGE = DEFAULT_REFRESH_MAX_AGE;

type SameSite = boolean | "lax" | "strict" | "none";

interface CookieAttributes {
  httpOnly?: boolean;
  sameSite?: SameSite;
  secure?: boolean;
  path?: string;
  maxAge?: number;
}

/**
 * Minimal structural cookie store. Satisfied by both the `cookies()` jar and a
 * `NextResponse`'s `.cookies` (both expose these exact overloads).
 */
export interface CookieStore {
  set(name: string, value: string, options?: CookieAttributes): unknown;
  delete(name: string): unknown;
}

interface SetAuthCookiesArgs {
  access: string;
  refresh?: string;
  /** Backend-reported access token lifetime in seconds (preferred TTL source). */
  expiresIn?: number;
  /** Backend-reported refresh token lifetime in seconds, if provided. */
  refreshExpiresIn?: number;
  /** When provided, also writes the long-lived profile_completed cookie. */
  profileCompleted?: boolean;
  /**
   * Issue `access` / `refresh` as SESSION cookies (no maxAge) so the whole
   * login dies when the browser is closed.
   *
   * This is what keeps a "signed up but never finished onboarding" account
   * from silently resuming the stepper days later: closing the browser drops
   * the tokens, so the next visit is anonymous and lands on /auth. A COMPLETED
   * profile is never session-scoped — those users keep the persistent,
   * TTL-derived cookies they have always had.
   *
   * Defaults to `profileCompleted === false` when that flag is supplied, so
   * call sites that already know the onboarding state get the right lifetime
   * for free.
   */
  sessionOnly?: boolean;
}

/** Minimal readable store — the `cookies()` jar and `NextRequest.cookies` both satisfy it. */
export interface ReadableCookieStore {
  get(name: string): { value: string } | undefined;
}

/**
 * Read the onboarding flag from a cookie jar. Only the literal "true" counts as
 * completed (same rule the proxy applies), so an absent cookie reads as "still
 * onboarding" and keeps the session scoped to the browser session.
 */
export function isProfileCompletedIn(store: ReadableCookieStore): boolean {
  try {
    return store.get(PROFILE_COMPLETED_COOKIE)?.value === "true";
  } catch {
    return false;
  }
}

/** Base options shared by every auth cookie. */
function baseOptions(): Omit<CookieAttributes, "maxAge"> {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

/**
 * Decode a JWT's `exp` (seconds since epoch) without any dependency.
 * Manual base64url decode of the payload segment. Returns null when the token is
 * not a well-formed JWT or has no numeric `exp`.
 */
export function decodeJwtExp(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = parts[1];
    // base64url -> base64
    let b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    if (pad === 2) b64 += "==";
    else if (pad === 3) b64 += "=";
    else if (pad === 1) return null;

    const json =
      typeof atob === "function"
        ? atob(b64)
        : Buffer.from(b64, "base64").toString("binary");

    const claims = JSON.parse(json) as { exp?: unknown };
    return typeof claims.exp === "number" && Number.isFinite(claims.exp)
      ? claims.exp
      : null;
  } catch {
    return null;
  }
}

/**
 * Resolve a cookie maxAge (seconds) for a token: prefer an explicit
 * backend-provided `expires_in`, else derive `exp - now` from the JWT, else the
 * supplied fallback. Always returns a positive integer.
 */
function resolveMaxAge(
  token: string,
  explicitExpiresIn: number | undefined,
  fallback: number,
): number {
  if (
    typeof explicitExpiresIn === "number" &&
    Number.isFinite(explicitExpiresIn) &&
    explicitExpiresIn > 0
  ) {
    return Math.floor(explicitExpiresIn);
  }
  const exp = decodeJwtExp(token);
  if (exp !== null) {
    const seconds = exp - Math.floor(Date.now() / 1000);
    if (seconds > 0) return seconds;
  }
  return fallback;
}

/**
 * Write the `access` (+ optional `refresh`, + optional `profile_completed`)
 * cookies on the given store with TTLs derived from the real token lifetime.
 *
 * Works with both the awaited `cookies()` jar (Server Action / Route Handler)
 * and a `NextResponse`'s `.cookies`.
 *
 * NOTE: in a Server Component render the `cookies()` jar is read-only and
 * `.set()` throws — callers that may run during render must guard / catch.
 */
export function setAuthCookies(store: CookieStore, args: SetAuthCookiesArgs): void {
  const { access, refresh, expiresIn, refreshExpiresIn, profileCompleted } = args;
  const opts = baseOptions();

  // Onboarding unfinished → session cookies (dropped when the browser closes);
  // completed → the usual TTL-derived lifetime.
  const sessionOnly = args.sessionOnly ?? profileCompleted === false;

  store.set(ACCESS_COOKIE, access, {
    ...opts,
    ...(sessionOnly
      ? {}
      : { maxAge: resolveMaxAge(access, expiresIn, DEFAULT_ACCESS_MAX_AGE) }),
  });

  if (refresh) {
    store.set(REFRESH_COOKIE, refresh, {
      ...opts,
      ...(sessionOnly
        ? {}
        : {
            maxAge: resolveMaxAge(
              refresh,
              refreshExpiresIn,
              DEFAULT_REFRESH_MAX_AGE,
            ),
          }),
    });
  }

  if (typeof profileCompleted === "boolean") {
    setProfileCompletedCookie(store, profileCompleted);
  }
}

/**
 * Write `profile_completed`.
 *
 * Asymmetric on purpose:
 *  - `true`  → long-lived, so a completed user keeps landing on /home across
 *              browser restarts.
 *  - `false` → a SESSION cookie (no maxAge / expires), so killing the browser
 *              removes the "signed up but not onboarded" marker instead of
 *              leaving it on disk forever.
 *
 * Gating is unaffected either way: the proxy only treats the literal string
 * "true" as completed, so an absent cookie and `false` both mean "not yet
 * onboarded" and still route the user to /onboarding.
 */
export function setProfileCompletedCookie(
  store: CookieStore,
  completed: boolean,
): void {
  store.set(PROFILE_COMPLETED_COOKIE, completed ? "true" : "false", {
    ...baseOptions(),
    ...(completed ? { maxAge: PROFILE_COMPLETED_MAX_AGE } : {}),
  });
}

/**
 * Write `yp_session_id`.
 *
 * Lifetime mirrors the auth pair it was issued alongside: session-scoped while
 * onboarding is unfinished (so closing the browser ends that login AND its
 * session id together), otherwise the refresh token's TTL. Leaving a stale id
 * behind would make the next login's heartbeats update the PREVIOUS row.
 */
export function setSessionIdCookie(
  store: CookieStore,
  sessionId: string,
  opts: { maxAge?: number; sessionOnly?: boolean } = {},
): void {
  const { maxAge, sessionOnly } = opts;
  const resolved =
    typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0
      ? Math.floor(maxAge)
      : DEFAULT_SESSION_ID_MAX_AGE;

  store.set(SESSION_ID_COOKIE, sessionId, {
    ...baseOptions(),
    ...(sessionOnly ? {} : { maxAge: resolved }),
  });
}

/**
 * Write `login_type`. Same lifetime rules as `yp_session_id`: it describes one
 * login, so it must not outlive the tokens that login was issued.
 */
export function setLoginTypeCookie(
  store: CookieStore,
  loginType: LoginType,
  opts: { maxAge?: number; sessionOnly?: boolean } = {},
): void {
  const { maxAge, sessionOnly } = opts;
  const resolved =
    typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0
      ? Math.floor(maxAge)
      : DEFAULT_REFRESH_MAX_AGE;

  store.set(LOGIN_TYPE_COOKIE, loginType, {
    ...baseOptions(),
    httpOnly: false,
    ...(sessionOnly ? {} : { maxAge: resolved }),
  });
}

/** Remove `login_type` (logout / dead session). */
export function clearLoginTypeCookie(store: CookieStore): void {
  store.delete(LOGIN_TYPE_COOKIE);
}

/** Remove `yp_session_id` (logout / dead session). */
export function clearSessionIdCookie(store: CookieStore): void {
  store.delete(SESSION_ID_COOKIE);
}

/** Remove `profile_completed` entirely (logout). */
export function clearProfileCompletedCookie(store: CookieStore): void {
  store.delete(PROFILE_COMPLETED_COOKIE);
}

/**
 * Alias for setting auth cookies directly on a `NextResponse` (its `.cookies`
 * is structurally a `CookieStore`). Returns the same response for chaining.
 */
export function setAuthCookiesOnResponse<R extends { cookies: CookieStore }>(
  response: R,
  args: SetAuthCookiesArgs,
): R {
  setAuthCookies(response.cookies, args);
  return response;
}

/** Remove the access + refresh cookies (used on logout / hard refresh failure). */
export function clearAuthCookies(store: CookieStore): void {
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
  // The session id dies with the tokens it was issued against. Kept here rather
  // than at each call site so no teardown path can forget it and leave the next
  // login writing heartbeats onto a dead row.
  store.delete(SESSION_ID_COOKIE);
  store.delete(LOGIN_TYPE_COOKIE);
}
