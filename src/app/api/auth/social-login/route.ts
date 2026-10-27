// src/app/api/auth/social-login/route.ts

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  setAuthCookiesOnResponse,
  setLoginTypeCookie,
  setSessionIdCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";
import { extractSessionId } from "@/lib/userSession";
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
import { getBackendUrl, getBackendServerCode } from "@/lib/backendUrl";

// const BACKEND = process.env.BACKEND_URL;  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover (restore this line; BACKEND is now resolved at request time inside POST)

// NextRequest (not Request) so `req.cookies` exposes the device id the proxy
// minted; the browser's User-Agent / forwarded IP come off `req.headers`.
export async function POST(req: NextRequest) {
  try {
    // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
    const BACKEND = await getBackendUrl();
    const body = await req.json();
    const clientHeaders = buildClientHeaders(req.cookies, req.headers);


    const res = await fetch(`${BACKEND}/api/mobile/social-login`, {
      method: "POST",
      headers: { ...clientHeaders, "Content-Type": "application/json" },
      // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
      body: JSON.stringify({ ...body, server: await getBackendServerCode() }),
    });

    const data = await res.json();

    // data.access and data.refresh expected as in your example
    const accessToken: string | undefined = data?.access;
    const refreshToken: string | undefined = data?.refresh;

    const nextRes = NextResponse.json(data, { status: res.status });

    // Issue access/refresh via the shared helper — maxAge derived from the real
    // token TTL (expires_in / JWT exp) instead of a session cookie, secure-in-prod.
    if (accessToken) {
      setAuthCookiesOnResponse(nextRes, {
        access: accessToken,
        refresh: refreshToken,
        expiresIn: data?.expires_in,
        refreshExpiresIn: data?.refresh_expires_in,
      });

      setLoginTypeCookie(nextRes.cookies, "social", {
        maxAge: data?.refresh_expires_in,
      });

      // This route returns its payload FLAT (no `data` envelope), which
      // extractSessionId handles. In practice the live social flow runs through
      // src/auth.ts instead; this stays in step so the two cannot drift.
      const sessionId = extractSessionId(data);
      if (sessionId) {
        setSessionIdCookie(nextRes.cookies, sessionId, {
          maxAge: data?.refresh_expires_in,
        });
      }
    }

    return nextRes;
    
  } catch (err: any) {
    return NextResponse.json(
      { status: "ERROR", message: err?.message || "Proxy error" },
      { status: 500 }
    );
  }
}