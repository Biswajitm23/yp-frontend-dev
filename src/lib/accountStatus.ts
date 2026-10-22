// Shared "the signed-in account no longer exists" signal.
//
// This is deliberately DISTINCT from UNAUTHENTICATED (src/lib/authError.ts):
//   - UNAUTHENTICATED → the caller simply isn't logged in. Prompt a login
//     (useAuthGate); never force-logout, never redirect off a public page.
//   - ACCOUNT_INACTIVE → the caller holds valid-looking httpOnly cookies for an
//     account the BACKEND has deleted / deactivated / suspended. The tokens can
//     never work again and refreshing them can't fix it, so the session has to be
//     torn down.
//
// Without this distinction the app spins: the cookies survive a backend delete,
// `/api/auth/has-session` keeps answering `authenticated: true`, every gated
// query stays enabled, each one fails with the backend's raw "Account is no
// longer active." string, react-query retries, and the cycle repeats forever.
//
// Isomorphic on purpose — imported by the server gateway (src/lib/api.ts, which
// is `server-only`) AND by client code, so it must stay dependency-free.

export const ACCOUNT_INACTIVE_CODE = "ACCOUNT_INACTIVE" as const;

/** User-facing copy. Deliberately still matches ACCOUNT_INACTIVE_PATTERN so the
 *  signal survives the services that re-throw `new Error(res.message)` and drop
 *  the `code` discriminator. */
export const ACCOUNT_INACTIVE_MESSAGE =
  "Your account is no longer active. Please log in again or contact support.";

/**
 * Matches the backend's account-status rejections, e.g.
 *   "Account is no longer active."      (observed)
 *   "Your account has been deleted"
 *   "This account has been deactivated"
 *   "User account is suspended"
 * Anchored on the account/user subject so a resource-level message ("this job
 * has been removed") can't trip it.
 */
const ACCOUNT_INACTIVE_PATTERN =
  /\b(?:your |this |the )?(?:user )?account\b[^.]{0,24}?\b(?:no longer active|no longer exists|not active|inactive|deactivated|deleted|disabled|suspended|terminated|removed)\b/i;

export function isAccountInactiveMessage(message?: string | null): boolean {
  return typeof message === "string" && ACCOUNT_INACTIVE_PATTERN.test(message);
}

/**
 * True when an upstream FAILURE response means "the account behind this token is
 * gone". Restricted to auth-ish statuses so an unrelated 404/409 body can never
 * force-log-out a healthy session — except for the unambiguous "no longer
 * active/exists" phrasing, which is honoured on any status because the backend
 * returns it outside the 401/403 range.
 */
export function isAccountInactiveResponse(
  status: number,
  message?: string | null,
): boolean {
  if (!isAccountInactiveMessage(message)) return false;
  return (
    status === 401 ||
    status === 403 ||
    /no longer (?:active|exists)/i.test(message ?? "")
  );
}

/** An Error carrying the ACCOUNT_INACTIVE discriminator. */
export class AccountInactiveError extends Error {
  code = ACCOUNT_INACTIVE_CODE;
  constructor(message = ACCOUNT_INACTIVE_MESSAGE) {
    super(message);
    this.name = "AccountInactiveError";
  }
}

/**
 * True when a caught value (or an `{ status, code, message }` envelope) carries
 * the account-inactive signal. Checks the `code` first, then falls back to the
 * message so the many services that re-throw `new Error(res.message)` — dropping
 * the code — are still covered without touching every one of them.
 */
export function isAccountInactiveError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; message?: unknown };
  if (e.code === ACCOUNT_INACTIVE_CODE) return true;
  return isAccountInactiveMessage(
    typeof e.message === "string" ? e.message : null,
  );
}
