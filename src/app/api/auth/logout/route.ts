import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  SESSION_ID_COOKIE,
  clearProfileCompletedCookie,
  clearSessionIdCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";

const BACKEND = process.env.BACKEND_URL;

// NextRequest (not Request) so the httpOnly access / session-id cookies and the
// device-id cookie are readable for the backend call below.
export async function POST(req: NextRequest) {
  // Close the backend UserSession FIRST, while the token cookies still exist.
  // This is what writes `ended_at` / `duration_seconds`; without it the row is
  // only closed by the idle sweep, ~15 minutes late. Best-effort on purpose:
  // logout must always succeed locally even when the backend is down.
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const sessionId = req.cookies.get(SESSION_ID_COOKIE)?.value;

  if (access) {
    try {
      const clientHeaders = buildClientHeaders(req.cookies, req.headers);
      await fetch(`${BACKEND}/api/web/auth/logout`, {
        method: "POST",
        headers: {
          ...clientHeaders,
          "Content-Type": "application/json",
          Authorization: `Bearer ${access}`,
        },
        // When session_id is null/absent the backend falls back to closing the
        // open sessions matching this account's X-Device-Id (always sent via
        // clientHeaders), so the field is simply omitted rather than sent null.
        body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      // Backend unreachable — the idle sweep will close the session at its
      // last heartbeat. The local logout below proceeds regardless.
    }
  }

  const res = NextResponse.json({ status: "OK", message: "Logged out" });

  // Clear access cookie
  res.cookies.set("access", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0
  });

  // Clear refresh cookie
  res.cookies.set("refresh", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0
  });

  // Clear user_info cookie
  res.cookies.set("user_info", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0
  });

  // Drop the onboarding flag too — otherwise a completed user's long-lived
  // "true" survives logout and waves the next account past /onboarding.
  clearProfileCompletedCookie(res.cookies);

  // End of this browser's UserSession: the backend was told above (when a
  // token existed), and the id is dropped here either way. Leaving it behind
  // would be the worse of the two — the NEXT login would inherit it and
  // heartbeat onto the old row.
  clearSessionIdCookie(res.cookies);

  return res;
}
