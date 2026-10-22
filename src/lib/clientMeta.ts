// src/lib/clientMeta.ts
//
// Client identity (platform / device / build) forwarded to the backend on EVERY
// outbound call, so the backend's UserSession row can be attributed to the real
// caller instead of to this Next server.
//
// WHY A COOKIE AND NOT localStorage
// ---------------------------------
// The mobile clients read their device id from AsyncStorage and attach it in an
// axios interceptor. The web app has no such transport: `axios` is an unused
// dependency here and every backend call is made SERVER-side —
//   - src/lib/api.ts          (Server Components + Server Actions)
//   - src/app/api/auth/*      (the auth proxy routes)
//   - src/auth.ts             (the NextAuth social signIn callback)
// A Server Component render cannot read localStorage, so a cookie is the only
// channel that reaches all three. The id is minted in src/proxy.ts so it exists
// on the very FIRST request, before any React runs — otherwise the first login
// would race the client bootstrap and report no device at all.
//
// WHY User-Agent / X-Forwarded-For ARE FORWARDED
// ----------------------------------------------
// Because this app is a BFF, the backend's socket peer is this Next server. Left
// alone it would stamp every UserSession row with the server's IP and undici's
// user agent. Forwarding the browser's originals is what makes `ip_address` and
// `user_agent` mean anything. The backend must read the forwarded headers, NOT
// its own REMOTE_ADDR.

/** Client-readable (NOT httpOnly) — DeviceIdSync mirrors it into localStorage. */
export const DEVICE_ID_COOKIE = "yp_device_id" as const;

/** This client is always the web app; ios/android are set by the RN client. */
export const CLIENT_PLATFORM = "web" as const;

/**
 * Build identifier reported as `client_version`. Sourced from the environment so
 * a release can stamp it without a code change; falls back to the package
 * version rather than throwing, because a missing build number must never break
 * a login.
 */
export const CLIENT_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

export const CLIENT_PLATFORM_HEADER = "X-Client-Platform" as const;
export const DEVICE_ID_HEADER = "X-Device-Id" as const;
export const CLIENT_VERSION_HEADER = "X-Client-Version" as const;

/** One year — a device id is meant to outlive many login sessions. */
export const DEVICE_ID_MAX_AGE = 60 * 60 * 24 * 365;

/** Minimal readable cookie jar — `cookies()`, `NextRequest.cookies` both satisfy it. */
export interface ReadableCookieStore {
  get(name: string): { value: string } | undefined;
}

/** Minimal readable header bag — `headers()` and `Request.headers` both satisfy it. */
export interface ReadableHeaders {
  get(name: string): string | null | undefined;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A device id is only trusted when it is a well-formed UUID. The cookie is
 * client-readable, so anything else is a hand-edited or truncated value and is
 * dropped rather than written into the analytics table.
 */
export function isValidDeviceId(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Mint a device id. `crypto.randomUUID` exists in the edge runtime (proxy.ts)
 * and in Node 19+; the manual path keeps an older Node server working.
 */
export function newDeviceId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Read a valid device id out of a cookie jar, or null. Never throws. */
export function readDeviceId(
  store?: ReadableCookieStore | null,
): string | null {
  if (!store) return null;
  try {
    const value = store.get(DEVICE_ID_COOKIE)?.value;
    return isValidDeviceId(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Serialize the device cookie as a raw `Set-Cookie` string.
 *
 * proxy.ts appends this with `headers.append()` instead of going through
 * `NextResponse.cookies.set()` on purpose: the refresh branch there overwrites
 * the whole `set-cookie` header with the rotated auth cookies, and a
 * ResponseCookies instance constructed before that overwrite would re-serialize
 * from its now-stale parse and silently drop them. A raw append cannot.
 *
 * NOT httpOnly — DeviceIdSync mirrors it into localStorage for parity with the
 * mobile clients. It identifies a browser, never authenticates one, so there is
 * nothing here to steal.
 */
export function serializeDeviceCookie(deviceId: string): string {
  const parts = [
    `${DEVICE_ID_COOKIE}=${deviceId}`,
    "Path=/",
    `Max-Age=${DEVICE_ID_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  return parts.join("; ");
}

/**
 * The headers every outbound backend request carries.
 *
 * `cookieStore` supplies the device id; `requestHeaders` supplies the browser's
 * own User-Agent and forwarded IP. Both are optional — a call made outside a
 * request scope still reports platform and version.
 *
 * Spread this FIRST at call sites so a caller's Authorization / Content-Type
 * always wins.
 */
export function buildClientHeaders(
  cookieStore?: ReadableCookieStore | null,
  requestHeaders?: ReadableHeaders | null,
): Record<string, string> {
  const out: Record<string, string> = {
    [CLIENT_PLATFORM_HEADER]: CLIENT_PLATFORM,
    [CLIENT_VERSION_HEADER]: CLIENT_VERSION,
  };

  const deviceId = readDeviceId(cookieStore);
  if (deviceId) out[DEVICE_ID_HEADER] = deviceId;

  if (requestHeaders) {
    try {
      // Forwarded verbatim so the backend sees the ORIGINAL client chain. When
      // no proxy sits in front of Next (local dev) these are absent and the
      // backend falls back to its own peer address — expected, not an error.
      const forwardedFor = requestHeaders.get("x-forwarded-for");
      if (forwardedFor) out["X-Forwarded-For"] = forwardedFor;

      const realIp = requestHeaders.get("x-real-ip");
      if (realIp) out["X-Real-IP"] = realIp;

      const userAgent = requestHeaders.get("user-agent");
      if (userAgent) out["User-Agent"] = userAgent;
    } catch {
      // Header bag unavailable in this context — platform/version still ship.
    }
  }

  return out;
}
