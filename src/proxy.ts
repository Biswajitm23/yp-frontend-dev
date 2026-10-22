import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isSafeCallbackUrl, CALLBACK_URL_PARAM } from "@/lib/callbackUrl";
import { clearSessionIdCookie, decodeJwtExp } from "@/lib/authCookies";
import {
  DEVICE_ID_COOKIE,
  newDeviceId,
  readDeviceId,
  serializeDeviceCookie,
} from "@/lib/clientMeta";

/** Refresh this many seconds BEFORE the token actually expires (clock skew). */
const ACCESS_EXPIRY_SKEW_SECONDS = 30;

/**
 * Is the access token past (or about to pass) its `exp`?
 *
 * The cookie used to carry a maxAge equal to the token TTL, so an expired token
 * simply disappeared and the "no access + refresh" branch below rotated it.
 * While onboarding is unfinished the pair is now issued as SESSION cookies
 * (no maxAge — see src/lib/authCookies.ts), so a dead token would otherwise sit
 * in the jar and every gated request would 401. Checking `exp` restores the
 * old behaviour for both cases.
 *
 * A token we can't decode is treated as live — never force a refresh loop on
 * an opaque token.
 */
function isAccessExpired(token: string): boolean {
  const exp = decodeJwtExp(token);
  if (exp === null) return false;
  return exp - ACCESS_EXPIRY_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}

/**
 * Truly public routes (no auth required)
 */
const PUBLIC_PATHS = [
  "/auth",
  "/auth/forgot-password",
  "/auth/reset-password",

  "/api/auth",
  "/api/ip-country",
  // NOTE: /api/alloptions removed — those public reads are now Server Actions
  // (src/app/actions/options.ts), no longer a proxy route needing an allow-list.
  "/api/contact-us-api",

  "/api/profile-complete",
  "/api/create-profile",
  // Used during step-0 of onboarding before profile_completed flips to true,
  // so it must bypass the "not yet onboarded → redirect to /onboarding" rule.
  "/api/checkphonenumberAvailability",

  "/help-and-support",
  "/contact-us",

  "/privacy-policy",
  "/terms-of-use",
];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * Account-only PAGES that still require authentication after the switch to
 * "pages are public by default". Everything not listed here is publicly
 * viewable (jobs, companies, events, feed, job/company/event details, other
 * users' profiles, etc.). Per-interaction gating is enforced client-side
 * (useAuthGate) and server-side (requireAuth).
 */
const ACCOUNT_ONLY_PATHS = [
  "/messages",
  "/notifications",
  "/connections",
  "/blocked-users",
];

function isAccountOnlyPath(pathname: string) {
  return ACCOUNT_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

/**
 * Features that are BUILT but not released yet. Their page files live under
 * src/app/(pages)/_disabled/ — the leading underscore makes Next treat that
 * folder as private, so the routes no longer exist and a direct hit would 404.
 * A 404 leaks that something is there, so bounce these to /home instead.
 *
 * To ship the feature: move the folder back out of _disabled AND delete its
 * entry here. Nothing else needs to change — the nav items and in-app links
 * are still in place (commented out in Header.tsx).
 */
const DISABLED_PATHS = ["/messages", "/connections"];

function isDisabledPath(pathname: string) {
  return DISABLED_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
}

function redirectToAuth(req: NextRequest) {
  const url = new URL("/auth", req.url);
  const current = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  if (isSafeCallbackUrl(current)) {
    url.searchParams.set(CALLBACK_URL_PARAM, current);
  }
  return NextResponse.redirect(url);
}

/**
 * Every request passes through here first, which is why the web client's device
 * identity is minted HERE rather than in a client bootstrap: the id then exists
 * on the very first request, before any React runs, so a first-time visitor's
 * opening backend calls are already attributable to a device.
 *
 * See src/lib/clientMeta.ts for why this is a cookie and not localStorage.
 */
export async function proxy(req: NextRequest) {
  const existingDeviceId = readDeviceId(req.cookies);
  const deviceId = existingDeviceId ?? newDeviceId();
  const minted = existingDeviceId === null;

  if (minted) {
    // Stamp it on the INCOMING request too, so THIS request's render and route
    // handlers can already read it via cookies() — not just the next one.
    req.cookies.set(DEVICE_ID_COOKIE, deviceId);
  }

  const res = await route(req, minted);

  if (minted) {
    // Raw append, never res.cookies.set(): the refresh branch below replaces the
    // entire set-cookie header with the rotated auth cookies, and a
    // ResponseCookies write layered on top of that would re-serialize from a
    // stale parse and silently drop them.
    res.headers.append("set-cookie", serializeDeviceCookie(deviceId));
  }

  return res;
}

async function route(
  req: NextRequest,
  minted: boolean,
): Promise<NextResponse> {
  const { pathname } = req.nextUrl;

  // ----------------------------------
  // Unreleased features — never render, never 404
  // ----------------------------------
  if (isDisabledPath(pathname)) {
    return NextResponse.redirect(new URL("/home", req.url));
  }

  /**
   * NextResponse.next(), carrying the mutated request headers when a device id
   * was just minted — that is what makes the fresh cookie readable downstream
   * within this same request.
   */
  const next = () =>
    minted
      ? NextResponse.next({ request: { headers: req.headers } })
      : NextResponse.next();

  const access = req.cookies.get("access")?.value;
  const refresh = req.cookies.get("refresh")?.value;
  const otpPending = req.cookies.get("otp_pending")?.value;
  const profileCompleted =
    req.cookies.get("profile_completed")?.value === "true";


  const isAuthenticated = Boolean(access || refresh);


  // allow refresh API itself
  if (pathname.startsWith("/api/auth/refresh")) {
    return next();
  }

  // ----------------------------------
  // Try token refresh if access missing
  // ----------------------------------
  // if (!access && refresh) {
  //   try {
  //     const refreshRes = await fetch(`${req.nextUrl.origin}/api/auth/refresh`, {
  //       method: "POST",
  //       headers: {
  //         Cookie: req.headers.get("cookie") || "",
  //       },
  //     });

  //     if (refreshRes.ok) {
  //       return NextResponse.next();
  //     }
  //   } catch (err) {
  //     console.error("Token refresh failed:", err);
  //   }

  //   const res = NextResponse.redirect(new URL("/auth", req.url));
  //   res.cookies.delete("access");
  //   res.cookies.delete("refresh");
  //   return res;
  // }

  // ----------------------------------
  // Try token refresh if access missing OR expired (NEW LOGIC)
  // ----------------------------------
  if ((!access || isAccessExpired(access)) && refresh) {
    const origin = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
    const refreshRes = await fetch(`${origin}/api/auth/refresh`, {
      method: "POST",
      headers: {
        Cookie: req.headers.get("cookie") || "",
      },
    });

    if (refreshRes.ok) {
      const res = next();

      const setCookie = refreshRes.headers.get("set-cookie");
      if (setCookie) {
        res.headers.set("set-cookie", setCookie);
      }

      return res;
    }

    // Refresh failed → the stale tokens are dead; clear them. Pages are public
    // by default now, so DON'T bounce a visitor to /auth just because a leftover
    // refresh cookie couldn't be refreshed — only account-only pages require it.
    // Otherwise let them continue and view the public page anonymously.
    //
    // /onboarding is gated like an account-only page here: the stepper writes to
    // the account, so a dead session must go back through login instead of
    // rendering a form whose every request would 401.
    const res =
      isAccountOnlyPath(pathname) || pathname.startsWith("/onboarding")
        ? redirectToAuth(req)
        : next();
    res.cookies.delete("access");
    res.cookies.delete("refresh");
    // The UserSession row this browser belonged to died with those tokens —
    // drop its id so the next login can't inherit it and write onto a dead row.
    clearSessionIdCookie(res.cookies);
    return res;
  }



  // ----------------------------------
  // Skip static files
  // ----------------------------------
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/static") ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icon") ||
    pathname.startsWith("/apple-icon") ||
    pathname.startsWith("/apple-touch-icon")
  ) {
    return next();
  }

  // ----------------------------------
  // Always allow auth APIs
  // ----------------------------------
  if (pathname.startsWith("/api/auth")) {
    return next();
  }

  // ----------------------------------
  // Public routes
  // ----------------------------------
  if (isPublicPath(pathname)) {
    // Prevent logged-in users from visiting auth pages
    if (isAuthenticated && pathname.startsWith("/auth")) {
      if (pathname === "/auth/verify" && otpPending) {
        return next();
      }
      // Respect the preserved deep-link (e.g. from an email "accept" URL) so
      // an already-logged-in user who visits /auth?callbackUrl=/foo lands
      // back on /foo instead of always bouncing to /home.
      const rawCallback = req.nextUrl.searchParams.get(CALLBACK_URL_PARAM);
      const target = isSafeCallbackUrl(rawCallback) ? rawCallback : "/home";
      return NextResponse.redirect(new URL(target, req.url));
    }
    return next();
  }

  // ----------------------------------
  // Onboarding (auth required, only if NOT completed)
  // ----------------------------------
  if (pathname.startsWith("/onboarding")) {
    if (!isAuthenticated) {
      return redirectToAuth(req);
    }

    if (profileCompleted) {
      return NextResponse.redirect(new URL("/home", req.url));
    }

    return next();
  }

  // ----------------------------------
  // Account-only pages still require authentication
  // (messages, notifications, connections, blocked-users)
  // ----------------------------------
  if (isAccountOnlyPath(pathname)) {
    if (!isAuthenticated) {
      return redirectToAuth(req);
    }
  }

  // ----------------------------------
  // Onboarding gate — preserved for AUTHENTICATED users only.
  // An authenticated user who hasn't finished onboarding is still pushed to
  // /onboarding (unchanged behavior). Anonymous visitors are NOT redirected —
  // all other pages (jobs, companies, events, feed, details, profiles) are
  // now publicly viewable.
  // ----------------------------------
  if (isAuthenticated && !profileCompleted) {
    return NextResponse.redirect(new URL("/onboarding", req.url));
  }

  // Public by default
  return next();
}

export const config = {
  // `.well-known` is excluded so Apple's CDN and Google's App Links verifier
  // fetch the association files as plain statics — no cookie logic, no chance
  // of a redirect, which would silently break deep-link verification.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|apple-touch-icon|\\.well-known).*)"],
};
