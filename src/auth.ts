import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import Apple from "next-auth/providers/apple"
import { cookies, headers } from "next/headers";
import {
  setAuthCookies,
  setLoginTypeCookie,
  setSessionIdCookie,
} from "@/lib/authCookies";
import { buildClientHeaders } from "@/lib/clientMeta";
import { extractSessionId } from "@/lib/userSession";
import {
  SOCIAL_AUTH_INTENT_COOKIE,
  SOCIAL_NO_ACCOUNT_REASON,
} from "@/lib/socialAuthIntent";
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
import { getBackendUrl } from "@/lib/backendUrl";

// const BACKEND = process.env.BACKEND_URL;  // TEMP: backend migration (VM -> Cloud Run) — remove after cutover (restore this line; BACKEND is now resolved at request time inside the signIn callback below)

/** Non-auth client-readable cookie attributes (theme_settings). secure-in-prod. */
const clientCookieConfig = {
  httpOnly: false,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [Google, LinkedIn, Apple],
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        if (!user.email) {
          console.error("No email provided");
          return false;
        }
        
        // TEMP: backend migration (VM -> Cloud Run) — remove after cutover
        const BACKEND = await getBackendUrl();

        // Client identity for every backend call below. The social flow never
        // passes through src/lib/api.ts, so without this the entire
        // Google/LinkedIn/Apple path would report no device and stamp THIS
        // server's address onto the UserSession row.
        const clientHeaders = buildClientHeaders(
          await cookies(),
          await headers(),
        );

        const authType = 'social' as const;
        const authIdentifier = 'email';

        const first_name = user?.name?.split(" ")[0] || "";
        const last_name = user?.name?.split(" ").slice(1).join(" ") || "";

        // console.log(
          // `Attempting social login/signup for ${user.email} via ${account?.provider}`
        // );

        // First, try to login
        const loginRes = await fetch(`${BACKEND}/api/mobile/auth/login`, {
          method: "POST",
          headers: { ...clientHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            login_type: authType,
            identifier: authIdentifier,
            value: user.email,
          }),
        });

        const loginData = await loginRes.json();
        const storeLoginData = loginData?.data;

        // If login successful
        if (loginRes.ok && storeLoginData?.access_token) {
          const cookieStore = await cookies();

          user.id = storeLoginData?.user?.id;
          (user as any).profile_completion_status = String(
            storeLoginData?.user?.profile_completion_status || "incomplete"
          );
          (user as any).terms_accepted = storeLoginData?.user?.terms_accepted ?? false;
          (user as any).is_suspended = storeLoginData?.user?.is_suspended ?? false;

          const isProfileComplete =
            storeLoginData?.user?.profile_completion_status === 1 ||
            storeLoginData?.user?.profile_completion_status === "1";

          // Issue access/refresh (+ profile_completed) via the shared helper so
          // maxAge derives from the real token TTL and secure-in-prod applies.
          setAuthCookies(cookieStore, {
            access: storeLoginData.access_token,
            refresh: storeLoginData.refresh_token,
            expiresIn: storeLoginData?.expires_in,
            refreshExpiresIn: storeLoginData?.refresh_expires_in,
            profileCompleted: isProfileComplete,
          });

          setLoginTypeCookie(cookieStore, authType, {
            maxAge: storeLoginData?.refresh_expires_in,
            sessionOnly: !isProfileComplete,
          });

          // Social LOGIN issued tokens, so the backend opened a UserSession for
          // it. `is_signup` is the backend's call here for a reason: this
          // callback signs up and logs in back-to-back, so only the backend
          // knows whether the account already existed.
          const sessionId = extractSessionId(loginData);
          if (sessionId) {
            setSessionIdCookie(cookieStore, sessionId, {
              maxAge: storeLoginData?.refresh_expires_in,
              sessionOnly: !isProfileComplete,
            });
          }

          // Auto-accept terms for social login users who haven't accepted yet
          if (!storeLoginData?.user?.terms_accepted && storeLoginData?.access_token) {
            try {
              await fetch(`${BACKEND}/api/mobile/user/accept-terms`, {
                method: "POST",
                headers: {
                  ...clientHeaders,
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${storeLoginData.access_token}`,
                },
                body: JSON.stringify({ terms_version: "1.0", accepted: true }),
              });
              (user as any).terms_accepted = true;
            } catch {
              // non-fatal — proceed
            }
          }

          const themeSetting = storeLoginData?.user?.theme_setting ?? storeLoginData?.user?.theme_settings;
          if (themeSetting !== undefined && themeSetting !== null) {
            cookieStore.set("theme_settings", String(themeSetting), {
              ...clientCookieConfig,
              maxAge: 24 * 60 * 60,
            });
          }

          return true;
        }

        // Which tab the social button was pressed on (see socialAuthIntent.ts).
        // One-shot: read it, then drop it so it can't leak into a later attempt.
        const intentJar = await cookies();
        const isLoginIntent =
          intentJar.get(SOCIAL_AUTH_INTENT_COOKIE)?.value === "login";
        intentJar.delete(SOCIAL_AUTH_INTENT_COOKIE);

        // A LOGIN must never create an account. Accounts are matched by email
        // only, so an unknown email here is usually someone who changed their
        // account email — signing them up would hand them a second, blank
        // account. Send them back to the login form with an explanation.
        const accountNotFound =
          loginRes.status === 404 ||
          /not\s*found/i.test(String(loginData?.message ?? ""));
        if (isLoginIntent && accountNotFound) {
          return `/auth?tab=login&reason=${SOCIAL_NO_ACCOUNT_REASON}`;
        }

        // If user doesn't exist, try to signup
        if (
          !isLoginIntent &&
          (loginRes.status === 404 || loginData?.status === "ERROR")
        ) {
          const signupRes = await fetch(`${BACKEND}/api/mobile/auth/signup`, {
            method: "POST",
            headers: { ...clientHeaders, "Content-Type": "application/json" },
            body: JSON.stringify({
              signup_type: authType,
              auth_provider: account?.provider,
              first_name,
              last_name,
              email: user.email,
            }),
          });

          const signupData = await signupRes.json();

          if (!signupRes.ok) {
            console.error("Signup failed:", signupData);
            return false;
          }

          // After successful signup, login again
          const loginAfterSignupRes = await fetch(
            `${BACKEND}/api/mobile/auth/login`,
            {
              method: "POST",
              headers: { ...clientHeaders, "Content-Type": "application/json" },
              body: JSON.stringify({
                login_type: authType,
                identifier: authIdentifier,
                value: user.email,
              }),
            }
          );

          const loginAfterSignupData = await loginAfterSignupRes.json();
          const storeLoginAfterSignupData = loginAfterSignupData?.data;

          if (
            loginAfterSignupRes.ok &&
            storeLoginAfterSignupData?.access_token
          ) {
            const cookieStore = await cookies();

            user.id = storeLoginAfterSignupData?.user?.id;
            (user as any).profile_completion_status = String(
              storeLoginAfterSignupData?.user?.profile_completion_status || "incomplete"
            );
            (user as any).terms_accepted = storeLoginAfterSignupData?.user?.terms_accepted ?? false;
            (user as any).is_suspended = storeLoginAfterSignupData?.user?.is_suspended ?? false;

            const isProfileComplete =
              storeLoginAfterSignupData?.user?.profile_completion_status === 1 ||
              storeLoginAfterSignupData?.user?.profile_completion_status === "1";

            // Issue access/refresh (+ profile_completed) via the shared helper.
            setAuthCookies(cookieStore, {
              access: storeLoginAfterSignupData.access_token,
              refresh: storeLoginAfterSignupData.refresh_token,
              expiresIn: storeLoginAfterSignupData?.expires_in,
              refreshExpiresIn: storeLoginAfterSignupData?.refresh_expires_in,
              profileCompleted: isProfileComplete,
            });

            setLoginTypeCookie(cookieStore, authType, {
              maxAge: storeLoginAfterSignupData?.refresh_expires_in,
              sessionOnly: !isProfileComplete,
            });

            // Social SIGNUP, then an immediate login that issued the tokens —
            // the session opens here, once, not on the signup call above.
            const sessionId = extractSessionId(loginAfterSignupData);
            if (sessionId) {
              setSessionIdCookie(cookieStore, sessionId, {
                maxAge: storeLoginAfterSignupData?.refresh_expires_in,
                sessionOnly: !isProfileComplete,
              });
            }

            // Auto-accept terms for new social signups
            if (storeLoginAfterSignupData?.access_token) {
              try {
                await fetch(`${BACKEND}/api/mobile/user/accept-terms`, {
                  method: "POST",
                  headers: {
                    ...clientHeaders,
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${storeLoginAfterSignupData.access_token}`,
                  },
                  body: JSON.stringify({ terms_version: "1.0", accepted: true }),
                });
                (user as any).terms_accepted = true;
              } catch {
                // non-fatal
              }
            }

            const themeSettingAfterSignup = storeLoginAfterSignupData?.user?.theme_setting ?? storeLoginAfterSignupData?.user?.theme_settings;
            if (themeSettingAfterSignup !== undefined && themeSettingAfterSignup !== null) {
              cookieStore.set("theme_settings", String(themeSettingAfterSignup), {
                ...clientCookieConfig,
                maxAge: 24 * 60 * 60,
              });
            }

            return true;
          }
        }

        console.error("Authentication failed");
        return false;
      } catch (error) {
        console.error("SignIn callback error:", error);
        return false;
      }
    },

    // JWT callback - stores user data in JWT token
    async jwt({ token, user }) {
      if (user) {
        token.user_id = user.id;
        token.profile_completion_status = (user as any).profile_completion_status;
        token.terms_accepted = (user as any).terms_accepted;
        token.is_suspended = (user as any).is_suspended;
      }
      return token;
    },

    // Session callback - makes token data available in session
    async session({ session, token }) {
      if (token) {
        session.user.id = token.user_id as string;
        session.user.profile_completion_status = token.profile_completion_status as string;
        session.user.terms_accepted = token.terms_accepted as boolean | undefined;
        session.user.is_suspended = token.is_suspended as boolean | undefined;
      }
      return session;
    },
  },
});

// Helper function to clear user session on profile deletion
export async function clearUserSessionOnDelete() {
  const cookieStore = await cookies();
  
  cookieStore.delete("access");
  cookieStore.delete("refresh");
  
  await signOut({ redirect: false });
}

// Call this from your API route when backend notifies profile deletion
export async function handleProfileDeleteFromBackend() {
  try {
    await clearUserSessionOnDelete();
    return { success: true, message: "Session cleared" };
  } catch (error) {
    console.error("Error clearing session:", error);
    return { success: false };
  }
}