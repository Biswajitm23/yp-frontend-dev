import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  setAuthCookiesOnResponse,
  setProfileCompletedCookie,
  setSessionIdCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";
import { extractSessionId } from "@/lib/userSession";

const BACKEND = process.env.BACKEND_URL;

// NextRequest (not Request) so `req.cookies` exposes the device id the proxy
// minted; the browser's User-Agent / forwarded IP come off `req.headers`.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const clientHeaders = buildClientHeaders(req.cookies, req.headers);

    // Verify OTP request
    //
    // `body.purpose` is already "SIGNUP" or "TWO_FACTOR" here (VerifyClient sets
    // it), so the backend can derive `is_signup` from the request it already
    // receives. We deliberately do NOT send a boolean of our own: it would be
    // redundant, and a flag the browser controls has no business deciding
    // whether a row counts as a signup.

    const backendResponse = await fetch(
      `${BACKEND}/api/mobile/auth/verify-otp`,
      {
        method: "POST",
        headers: { ...clientHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    let data;
    try {
      data = await backendResponse.json();
    } catch {
      data = { status: "FAILED", message: "Invalid JSON from backend" };
    }


    // Explicit failure case logging
    if (!backendResponse.ok) {
      return NextResponse.json(
        {
          status: "FAILED",
          message: data?.message || "Backend verification failed",
          backendStatus: backendResponse.status,
          backendError: data,
        },
        { status: backendResponse.status }
      );
    }

    const nextRes = NextResponse.json(data, {
      status: backendResponse.status,
    });

    // Clear OTP pending cookie
    nextRes.cookies.delete("otp_pending");

    const profile_status = data?.data?.user?.profile_completion_status;
    const profileCompleted = profile_status === "1" || profile_status === 1;

    // Issue access/refresh via the shared helper — maxAge derived from the real
    // token TTL (expires_in / JWT exp), secure-in-prod, httpOnly. Until the
    // profile is completed they are SESSION cookies, so closing the browser
    // logs the half-onboarded account out instead of reopening the stepper.
    if (data?.data?.access_token) {
      setAuthCookiesOnResponse(nextRes, {
        access: data.data.access_token,
        refresh: data.data.refresh_token,
        expiresIn: data?.data?.expires_in,
        refreshExpiresIn: data?.data?.refresh_expires_in,
        sessionOnly: !profileCompleted,
      });

      // Where the majority of web sessions actually begin — BOTH a signup
      // completing its OTP and a 2FA login completing its second factor land
      // here. Gated on the token for the same reason as /api/auth/login.
      const sessionId = extractSessionId(data);
      if (sessionId) {
        setSessionIdCookie(nextRes.cookies, sessionId, {
          maxAge: data?.data?.refresh_expires_in,
          sessionOnly: !profileCompleted,
        });
      }
    }

    // "true" persists across browser restarts; "false" is a session cookie.
    setProfileCompletedCookie(nextRes.cookies, profileCompleted);

    return nextRes;
  } catch (err: any) {
    console.error("Server Error:", err);
    return NextResponse.json(
      {
        status: "ERROR",
        message: err?.message || "Internal Proxy Error",
      },
      { status: 500 }
    );
  }
}
