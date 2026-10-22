// src/lib/onboardingTabGuard.ts
//
// "One stepper, one tab" guard for the onboarding form
// (src/app/(pages)/onboarding/page.tsx).
//
// The server side already scopes a half-onboarded login to the BROWSER session:
// while `profile_completed` is not "true", `access` / `refresh` are issued
// without a maxAge (see src/lib/authCookies.ts), so closing the browser drops
// the tokens and the next visit lands on /auth.
//
// This module closes the remaining gap — closing the TAB while the browser
// stays open. It pairs two markers:
//
//   sessionStorage  yp:onboarding:tab   → per TAB   (dies with the tab)
//   cookie          yp_onboarding_tab   → per BROWSER SESSION (no maxAge)
//
// The first tab to open the stepper claims both. A later load with the cookie
// present but no tab marker can only mean the claiming tab is gone (closed) or
// that this is a second tab — either way the half-finished login is ended and
// the user starts again at /auth, which is the requested behaviour.
//
// Fail-open BY DESIGN: if storage is unavailable (private mode, blocked
// cookies) the guard reports "ok" and the stepper renders. Locking a genuine
// new signup out of onboarding would be far worse than missing the check.

import { clearOnboardingDraft } from "@/lib/onboardingDraft";

const TAB_KEY = "yp:onboarding:tab";
const CLAIM_COOKIE = "yp_onboarding_tab";

function readClaimCookie(): boolean {
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${CLAIM_COOKIE}=1`));
}

function writeClaimCookie(): void {
  // No `expires` / `max-age` → a session cookie, gone when the browser closes.
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CLAIM_COOKIE}=1; path=/; samesite=lax${secure}`;
}

function deleteClaimCookie(): void {
  document.cookie = `${CLAIM_COOKIE}=; path=/; max-age=0; samesite=lax`;
}

/**
 * Claim the stepper for THIS tab.
 *
 *  "ok"    → render the stepper (this tab owns it, or just took ownership).
 *  "stale" → the owning tab is gone / this is another tab; the caller must end
 *            the session via `endStaleOnboardingSession()`.
 */
export function claimOnboardingTab(): "ok" | "stale" {
  if (typeof window === "undefined") return "ok";
  try {
    // Already ours — covers reloads and in-app navigation back to /onboarding.
    if (window.sessionStorage.getItem(TAB_KEY)) return "ok";

    if (readClaimCookie()) return "stale";

    window.sessionStorage.setItem(TAB_KEY, "1");
    writeClaimCookie();
    return "ok";
  } catch {
    return "ok";
  }
}

/** Drop both markers so the next login can claim the stepper cleanly. */
export function releaseOnboardingTab(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(TAB_KEY);
  } catch {
    // ignore
  }
  try {
    deleteClaimCookie();
  } catch {
    // ignore
  }
}

/**
 * End a half-finished onboarding that is being resumed from a tab that never
 * owned it: clear the local draft, drop the httpOnly auth cookies, sign out of
 * next-auth (the social path) and land on the login form.
 *
 * A plain redirect would not do — the tokens are still valid, so the proxy
 * would bounce /auth straight back to /home → /onboarding.
 */
export async function endStaleOnboardingSession(): Promise<void> {
  releaseOnboardingTab();
  clearOnboardingDraft();

  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // Offline — the redirect below still gets the user off the stepper.
  }

  try {
    const { signOut } = await import("next-auth/react");
    await signOut({ redirect: false });
  } catch {
    // No next-auth session (email/password path) — nothing to sign out of.
  }

  window.location.replace("/auth?tab=login");
}
