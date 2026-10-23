// src/lib/socialAuthIntent.ts
//
// Carries WHICH tab a social button was pressed on (Login vs Sign up) across
// the OAuth round-trip, so the next-auth `signIn` callback (src/auth.ts) knows
// whether it may create an account.
//
// Why it exists: social accounts are matched by email only. Without the intent,
// "Log in with Google" for an email the backend doesn't know silently signed up
// a brand-new blank account and dropped the user on /onboarding — which is what
// happened to anyone who had changed their account email and then logged in
// with the old Google address.
//
// Isomorphic on purpose — imported by the client buttons AND by src/auth.ts, so
// it must stay dependency-free.

export const SOCIAL_AUTH_INTENT_COOKIE = "social_auth_intent" as const;

export type SocialAuthIntent = "login" | "signup";

/** `reason` flag carried to /auth when a social LOGIN found no account. */
export const SOCIAL_NO_ACCOUNT_REASON = "social-no-account";

export const SOCIAL_NO_ACCOUNT_TOAST = "No account found";

/** Long enough to get through the provider's consent screen, no longer. */
const INTENT_MAX_AGE_SECONDS = 10 * 60;

/**
 * Record the intent just before `signIn()` redirects to the provider.
 *
 * Apple returns with a cross-site form POST, which a `SameSite=Lax` cookie does
 * not ride along on, so over https the cookie is `SameSite=None; Secure`. A
 * missing cookie is read as "signup" by the callback, i.e. the previous
 * behaviour — it can never lock a genuine new user out.
 */
export function writeSocialAuthIntent(intent: SocialAuthIntent): void {
  if (typeof document === "undefined") return;
  try {
    const attrs =
      window.location.protocol === "https:"
        ? "samesite=none; secure"
        : "samesite=lax";
    document.cookie = `${SOCIAL_AUTH_INTENT_COOKIE}=${intent}; path=/; max-age=${INTENT_MAX_AGE_SECONDS}; ${attrs}`;
  } catch {
    // Cookies blocked — the callback falls back to the signup behaviour.
  }
}
