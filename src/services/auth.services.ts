"use server";

// Auth pre-login flows + account deletion — migrated off the client axios
// transport (REQUIREMENTS §10 Phase 4). This module is a set of Server Actions
// ("use server"); the httpOnly-cookie → Bearer translation and the inline
// refresh/rotation are owned by the server gateway src/lib/api.ts (D2/D5), so
// there is no client transport and no public backend-origin env var.
//
//   - forgotPassword / resetPassword / resendOtp: pre-auth flows on the backend
//     (/api/mobile/auth/*). They run with auth:"none" (no token to attach).
//   - deleteAccount: a strict write — the gateway attaches the access cookie as
//     a Bearer and rotates it on 401. Returns the same { status, message } shape
//     the call sites (Header / ProfileDropDown) expect.

import { api } from "@/lib/api";

interface AuthResponse {
  message: string;
  status?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}

export async function deleteAccount(
  userId: string,
  pushToken: string = "",
): Promise<{ status: number; message?: string }> {
  const res = await api.post<{ message?: string }>(
    "/api/mobile/account/delete/",
    { user_id: userId, push_token: pushToken },
    { auth: "strict" },
  );

  if (res.status !== "OK") {
    const err = new Error(
      res.message || "Failed to delete account",
    ) as Error & { status?: number };
    if (res.code === "UNAUTHENTICATED") err.status = 401;
    throw err;
  }

  return { status: 200, message: res.data?.message };
}

export async function forgotPassword(
  identifier: string,
  value: string,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/forgot-password",
    { identifier, value },
    { auth: "none" },
  );

  if (res.status !== "OK") {
    throw new Error(
      res.message || "An error occurred while processing your request.",
    );
  }

  // The old proxy returned the backend body verbatim; the call site
  // (forgot-password/page) reads `response.data.user.id`. Preserve the original
  // service's behaviour of throwing when the backend body itself signals ERROR.
  const body = (res.data ?? { message: "OK", status: "OK" }) as AuthResponse;
  if (body.status === "ERROR") {
    throw new Error(body.message || "An error occurred while processing your request.");
  }
  return body;
}

export async function resetPassword(
  userId: string,
  otp: string,
  newPassword: string,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/change-password",
    { user_id: userId, otp, new_password: newPassword },
    { auth: "none" },
  );

  // RETURN the failure, never throw it: a production build strips the message
  // off any error thrown inside a Server Action (the browser gets a 500 and
  // "Minified React error #441"), so a wrong/expired OTP would lose the
  // backend's own explanation. The call site reads `status === "ERROR"`.
  if (res.status !== "OK") {
    return {
      status: "ERROR",
      message:
        res.message || "An error occurred while processing your request.",
    };
  }

  return (res.data ?? { message: "OK", status: "OK" }) as AuthResponse;
}

export async function resendOtp(
  purpose: "SIGNUP" | "TWO_FACTOR" | "FORGOT_PASSWORD",
  identifier: "email" | "phone",
  value: string,
  userId?: string,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/resend-otp",
    { purpose, identifier, value, user_id: userId },
    { auth: "none" },
  );

  if (res.status !== "OK") {
    throw new Error(
      res.message || "An error occurred while processing your request.",
    );
  }

  return (res.data ?? { message: "OK", status: "OK" }) as AuthResponse;
}

// ── Change email (logged-in) ────────────────────────────────────────────────
// Two-step flow from the profile page: send-otp mails a code to the NEW
// address, verify-otp confirms it and swaps the account email. Both are strict
// writes (the gateway attaches the access cookie as a Bearer). Failures are
// RETURNED, not thrown, for the same reason as resetPassword above — a thrown
// Server Action error loses the backend's message in a production build.

export async function sendUpdateEmailOtp(email: string): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/update-email/send-otp",
    { email },
    { auth: "strict" },
  );

  if (res.status !== "OK") {
    return {
      status: "ERROR",
      message: res.message || "Failed to send OTP. Please try again.",
    };
  }

  return { ...(res.data ?? { message: "OTP sent successfully" }), status: "OK" };
}

export async function verifyUpdateEmailOtp(
  email: string,
  otp: string,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/update-email/verify-otp",
    { email, otp },
    { auth: "strict" },
  );

  if (res.status !== "OK") {
    return {
      status: "ERROR",
      message: res.message || "The OTP is invalid or has expired",
    };
  }

  return {
    ...(res.data ?? { message: "Email updated successfully" }),
    status: "OK",
  };
}

// ── Change password (logged-in) ─────────────────────────────────────────────
// Strict write from the profile dropdown. Failure is RETURNED, not thrown, so
// the backend's own message (e.g. wrong current password) survives a
// production build — see resetPassword above.
export async function updatePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthResponse> {
  const res = await api.post<AuthResponse>(
    "/api/mobile/auth/update-password",
    // Social-login accounts may have no password yet, so the current password
    // is only sent when the user actually entered one.
    {
      ...(currentPassword ? { current_password: currentPassword } : {}),
      new_password: newPassword,
    },
    { auth: "strict" },
  );

  if (res.status !== "OK") {
    return {
      status: "ERROR",
      message: res.message || "Failed to update password. Please try again.",
    };
  }

  return {
    ...(res.data ?? { message: "Password updated successfully" }),
    status: "OK",
  };
}
