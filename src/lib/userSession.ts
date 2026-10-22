// src/lib/userSession.ts
//
// Web-side half of the UserSession feature (backend plan steps 1–4).
//
// The backend creates exactly ONE UserSession row wherever it actually issues
// tokens, and returns that row's id in the auth response. This module's only job
// is to find that id in the response body — the cookie that stores it lives in
// src/lib/authCookies.ts with every other issued cookie.
//
// WHERE A WEB SESSION BEGINS
// --------------------------
// Unlike the mobile clients there is no single "login view" here. Three separate
// server paths can issue tokens, and each one starts a session:
//   1. src/app/api/auth/verify     — OTP verify: BOTH signup and 2FA login
//   2. src/app/api/auth/login      — direct login, when 2FA is off
//   3. src/auth.ts                 — social login, and social signup-then-login
// A login that only *starts* 2FA issues no tokens and must NOT open a session —
// otherwise every abandoned OTP leaves a phantom row. Each call site therefore
// gates session capture on the same condition it gates cookie issuance on:
// an access token being present.
//
// `is_signup` is deliberately NOT sent from here. The client already tells
// verify-otp its `purpose`, and the backend is the only party that actually
// knows whether an account was just created (decisive on the social path, which
// signs up and logs in back-to-back). A boolean from the browser would be both
// redundant and trivially spoofable.

/** Response shapes the id may arrive in, across the three backend endpoints. */
type Unknownish = Record<string, unknown> | null | undefined;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function pickId(source: Unknownish): string | null {
  if (!source) return null;
  // Direct scalar keys, in the order the backend is most likely to use.
  for (const key of ["session_id", "user_session_id", "sessionId"]) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  // Nested object form: { session: { id } } / { user_session: { id } }.
  for (const key of ["session", "user_session"]) {
    const nested = asRecord(source[key]);
    if (!nested) continue;
    const id = nested.id;
    if (typeof id === "string" && id.trim()) return id.trim();
    if (typeof id === "number" && Number.isFinite(id)) return String(id);
  }
  return null;
}

/**
 * Pull the UserSession id out of an auth response, tolerating the envelope
 * differences between the endpoints: /auth/login and /auth/verify-otp nest their
 * payload under `data`, while /social-login returns it flat. Returns null when
 * the backend has not shipped its half yet, which is the expected state until
 * then — a missing id must never break a login.
 */
export function extractSessionId(payload: unknown): string | null {
  const root = asRecord(payload);
  if (!root) return null;
  return pickId(asRecord(root.data)) ?? pickId(root);
}
