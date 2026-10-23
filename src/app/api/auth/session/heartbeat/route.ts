// src/app/api/auth/session/heartbeat/route.ts
//
// BFF half of the UserSession heartbeat (SESSION_TRACKING_CLIENT_GUIDE §3).
//
// The session id lives in the httpOnly `yp_session_id` cookie, so browser JS
// cannot send it to the backend itself — it POSTs here with no body and this
// route supplies the id and the bearer token from the cookie jar. That is also
// what lets `navigator.sendBeacon` work as the tab-close ping: a beacon can
// carry no custom headers, but it does carry same-origin cookies.
//
// Contract with the client (SessionHeartbeat.tsx): this route ALWAYS answers
// 200 with `data.active`. A heartbeat is fire-and-forget — a backend error or
// timeout must surface as nothing at all, never as a failed request the
// browser console flags on every tick.
//
// Sessions come in a cycle, not one per login. The backend closes a session
// once it has gone quiet for SESSION_IDLE_TIMEOUT_MINUTES, and the next ping
// after that opens a fresh row for the new visit — so this route's job is to
// keep passing pings through and to store whichever id comes back. It must
// never drop the cookie on a bad answer: a browser with no `yp_session_id`
// used to short-circuit before the fetch, which meant one closed session
// silently ended tracking until the user logged in again.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  ACCESS_COOKIE,
  SESSION_ID_COOKIE,
  setSessionIdCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
import { getBackendUrl } from "@/lib/backendUrl";

// const BACKEND = process.env.BACKEND_URL;  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover (restore this line; BACKEND is now resolved at request time inside POST)

export async function POST(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  const sessionId = req.cookies.get(SESSION_ID_COOKIE)?.value;

  // Only the bearer token is required. A missing session id is NOT a reason to
  // stop: the backend treats the ping as "this user is here" and answers with
  // the id to use, opening a row if the sweep already closed the last one. That
  // is what lets a browser with no `yp_session_id` — first ping after a
  // restart, or a cookie dropped by an older build of this route — rejoin
  // tracking on its next tick instead of waiting for a login that the 60-day
  // refresh token can put weeks away.
  if (!access) {
    return NextResponse.json({ status: "OK", data: { active: false } });
  }

  try {
    // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
    const BACKEND = await getBackendUrl();
    const clientHeaders = buildClientHeaders(req.cookies, req.headers);

    const backendRes = await fetch(`${BACKEND}/api/web/session/heartbeat`, {
      method: "POST",
      headers: {
        ...clientHeaders,
        "Content-Type": "application/json",
        Authorization: `Bearer ${access}`,
      },
      // Omitted rather than sent as null when there is nothing to send.
      body: JSON.stringify(sessionId ? { session_id: sessionId } : {}),
      // A hung backend must not pile up 3-minutely pending requests.
      signal: AbortSignal.timeout(10_000),
    });

    const data = await backendRes.json().catch(() => null);

    // The id the backend wants used from here on. Usually the one that was
    // sent; a new one when the user came back after the idle sweep closed the
    // last session and a fresh row was opened for this visit. Storing it is
    // what keeps logout precise — closing by id beats falling back to matching
    // on the device.
    const current = backendRes.ok ? data?.data?.session_id : null;
    const res = NextResponse.json({
      status: "OK",
      data: { active: data?.data?.active !== false },
    });

    if (typeof current === "string" && current && current !== sessionId) {
      setSessionIdCookie(res.cookies, current);
    }

    // The cookie is never cleared here. `active: false` now means only that
    // the backend could not write — a closed session is reopened rather than
    // reported dead — and dropping the id on a transient failure used to be
    // self-perpetuating: with no cookie the route returned early, so the
    // backend was never called again and no session was ever opened until the
    // next login.
    return res;
  } catch {
    // Network/timeout — a missed heartbeat is just a missed heartbeat; the
    // next tick covers it. Keep the cookie: the session may well be alive.
    return NextResponse.json({ status: "OK", data: { active: true } });
  }
}
