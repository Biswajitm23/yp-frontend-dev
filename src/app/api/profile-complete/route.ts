import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  setAuthCookies,
  setProfileCompletedCookie,
} from "@/lib/authCookies";

export async function GET() {
  const url = `${process.env.NEXT_PUBLIC_APP_URL}/home`;

  const res = NextResponse.redirect(url);

  // Onboarding finished — this one is long-lived, so the user keeps landing on
  // /home even after the browser is closed and reopened.
  setProfileCompletedCookie(res.cookies, true);

  // The access/refresh pair was issued as SESSION cookies while the profile was
  // incomplete (so an abandoned signup can't resume the stepper after a browser
  // restart). Now that onboarding is done, re-issue the SAME tokens with their
  // real TTL — otherwise this user would still be logged out by closing the
  // browser, and a completed profile must behave exactly as it always has.
  const jar = await cookies();
  const access = jar.get(ACCESS_COOKIE)?.value;
  const refresh = jar.get(REFRESH_COOKIE)?.value;

  if (access) {
    setAuthCookies(res.cookies, {
      access,
      refresh,
      sessionOnly: false,
    });
  }

  return res;
}
