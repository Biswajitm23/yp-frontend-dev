"use client";

// Client-side teardown for a session whose backend account is gone
// (see src/lib/accountStatus.ts for why this is separate from UNAUTHENTICATED).
//
// Idempotent BY DESIGN: a single page typically has many in-flight queries
// (feed, profile, notifications, messages, connections…) and they all fail at
// once when the account is deleted. Without the latch every one of them would
// fire its own logout + redirect, which is exactly the request storm this fixes.

import { signOut } from "next-auth/react";

const AUTH_PATH = "/auth";
export const ACCOUNT_INACTIVE_REASON = "account-inactive";

/** Copy raised on /auth once the redirect below lands. Lives here beside the
 *  reason flag so the two can't drift apart. */
export const ACCOUNT_INACTIVE_TOAST =
  "Your account is no longer active. If you think this is a mistake, contact support@youngprofessionals.global.";

/** Latch — first caller wins, everyone else no-ops until the page navigates. */
let teardownStarted = false;

/**
 * Clear every trace of the dead session and land the user on /auth with a
 * notice. Safe to call from any number of error handlers concurrently.
 */
export async function handleAccountInactive(): Promise<void> {
  if (typeof window === "undefined" || teardownStarted) return;
  teardownStarted = true;

  // httpOnly `access` / `refresh` / `user_info` cookies — only the server can
  // clear these, and they're what keeps /api/auth/has-session answering `true`.
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    /* offline — the redirect below still stops the request loop */
  }

  // next-auth session (social-login path).
  try {
    await signOut({ redirect: false });
  } catch {
    /* no session to clear */
  }

  // Already on /auth: the cookies are gone, so leave the user on the form rather
  // than reloading (a reload here would re-run this on every visit).
  if (window.location.pathname.startsWith(AUTH_PATH)) return;

  window.location.replace(
    `${AUTH_PATH}?tab=login&reason=${ACCOUNT_INACTIVE_REASON}`,
  );
}
