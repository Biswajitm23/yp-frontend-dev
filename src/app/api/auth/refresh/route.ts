// // src/app/api/auth/refresh/route.ts
import { NextResponse, NextRequest } from "next/server";
import {
  clearSessionIdCookie,
  setAuthCookiesOnResponse,
  setProfileCompletedCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
import { getBackendUrl } from "@/lib/backendUrl";

// Bounds each backend call so a silent backend can't leave the refresh (and
// every request waiting on it in the proxy) pending forever.
const BACKEND_TIMEOUT_MS = 10000;

// const BACKEND = process.env.BACKEND_URL;  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover (restore this line; BACKEND is now resolved at request time inside POST)

export async function POST(req: NextRequest) {
  try {
    // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
    const BACKEND = await getBackendUrl();
    const refresh_token = req.cookies.get("refresh")?.value;
    const clientHeaders = buildClientHeaders(req.cookies, req.headers);

    if (!refresh_token) {
      return NextResponse.json(
        { status: "ERROR", code: "NO_REFRESH_TOKEN", message: "No refresh token" },
        { status: 401 },
      );
    }

    const res = await fetch(`${BACKEND}/api/mobile/auth/token/refresh`, {
      method: "POST",
      headers: { ...clientHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const response = NextResponse.json(data, { status: res.status });
      response.cookies.delete("access");
      response.cookies.delete("refresh");
      // The UserSession those tokens belonged to is unreachable now; drop its id
      // so the next login starts a clean one.
      clearSessionIdCookie(response.cookies);
      return response;
    }

    const newAccess = data?.data?.access_token;
    const newRefresh = data?.data?.refresh_token;

    const response = NextResponse.json({ status: "OK", ...data });

    // ========set profile completed cookie ==================
    // ===== NEW: Fetch profile status =====
    let profileStatus = "0";
    if (newAccess) {
      try {
        const profileRes = await fetch(`${BACKEND}/api/mobile/profile`, {
          method: "POST",
          headers: {
            ...clientHeaders,
            Authorization: `Bearer ${newAccess}`,
          },
          signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
        });

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          profileStatus = profileData?.data?.profile_completion_status || "0";
        }
      } catch {
        // Profile status fetch failed, default to "0"
      }
    }
    // ===== END NEW =====

    const profileCompleted = profileStatus === "1";

    // Issue access/refresh via the shared helper — maxAge derived from the REAL
    // token TTL (fixes the prior access=60s / refresh=24h refresh-storm +
    // premature-logout bug). When the backend returns no new refresh token we
    // re-issue the existing one so the refresh window is preserved.
    //
    // A rotation must NOT promote a half-onboarded session to a persistent one:
    // while the profile is incomplete the refreshed pair stays session-scoped,
    // so closing the browser still ends the login.
    if (newAccess) {
      setAuthCookiesOnResponse(response, {
        access: newAccess,
        refresh: newRefresh ?? refresh_token,
        expiresIn: data?.data?.expires_in,
        refreshExpiresIn: data?.data?.refresh_expires_in,
        sessionOnly: !profileCompleted,
      });
    }

    // Shared issuer: "true" is long-lived, "false" is a session cookie. Writing
    // an 80-year "false" here (as this route used to) left the not-onboarded
    // marker on disk forever, which is exactly what it must not do.
    setProfileCompletedCookie(response.cookies, profileCompleted);

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { status: "ERROR", message: err?.message ?? "Proxy error" },
      { status: 500 },
    );
  }
}
