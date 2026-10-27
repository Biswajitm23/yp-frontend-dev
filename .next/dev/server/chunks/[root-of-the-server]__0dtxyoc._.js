module.exports = [
"[externals]/crypto [external] (crypto, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("crypto", () => require("crypto"));

module.exports = mod;
}),
"[externals]/next/dist/build/adapter/setup-node-env.external.js [external] (next/dist/build/adapter/setup-node-env.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/build/adapter/setup-node-env.external.js", () => require("next/dist/build/adapter/setup-node-env.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/memory-cache.external.js [external] (next/dist/server/lib/incremental-cache/memory-cache.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/memory-cache.external.js", () => require("next/dist/server/lib/incremental-cache/memory-cache.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/shared-cache-controls.external.js [external] (next/dist/server/lib/incremental-cache/shared-cache-controls.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js", () => require("next/dist/server/lib/incremental-cache/shared-cache-controls.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/incremental-cache/tags-manifest.external.js [external] (next/dist/server/lib/incremental-cache/tags-manifest.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/incremental-cache/tags-manifest.external.js", () => require("next/dist/server/lib/incremental-cache/tags-manifest.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/lib/router-utils/instrumentation-globals.external.js [external] (next/dist/server/lib/router-utils/instrumentation-globals.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/lib/router-utils/instrumentation-globals.external.js", () => require("next/dist/server/lib/router-utils/instrumentation-globals.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/node:async_hooks [external] (node:async_hooks, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:async_hooks", () => require("node:async_hooks"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[externals]/path [external] (path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("path", () => require("path"));

module.exports = mod;
}),
"[project]/src/lib/authCookies.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// src/lib/authCookies.ts
//
// Single source of truth for issuing/clearing the httpOnly auth cookies.
// Replaces the 5 inconsistent issuers (src/auth.ts, auth/login, auth/verify,
// auth/refresh, auth/social-login) whose maxAge ranged over {session, 60s, 24h,
// 7d} — see API_AND_AUTH_REVIEW Part A.4 / migration-map cookieIssuers[].
//
// Decision D7: cookie maxAge is derived from the REAL token TTL — preferring a
// backend-provided `expires_in` (seconds), else the JWT `exp` claim — instead of
// a hardcoded lifetime.
//
// `store` is any cookie store exposing `.set()` / `.delete()`. Both the awaited
// `cookies()` jar from `next/headers` (ReadonlyRequestCookies) and a
// `NextResponse`'s `.cookies` (ResponseCookies) share the same set/delete
// signatures (ReadonlyRequestCookies picks them straight from ResponseCookies),
// so a single structural type works for both call sites.
/** Cookie names — must match the existing app (see auth/login, auth/refresh, auth/verify). */ __turbopack_context__.s([
    "ACCESS_COOKIE",
    ()=>ACCESS_COOKIE,
    "LOGIN_TYPE_COOKIE",
    ()=>LOGIN_TYPE_COOKIE,
    "PROFILE_COMPLETED_COOKIE",
    ()=>PROFILE_COMPLETED_COOKIE,
    "REFRESH_COOKIE",
    ()=>REFRESH_COOKIE,
    "SESSION_ID_COOKIE",
    ()=>SESSION_ID_COOKIE,
    "clearAuthCookies",
    ()=>clearAuthCookies,
    "clearLoginTypeCookie",
    ()=>clearLoginTypeCookie,
    "clearProfileCompletedCookie",
    ()=>clearProfileCompletedCookie,
    "clearSessionIdCookie",
    ()=>clearSessionIdCookie,
    "decodeJwtExp",
    ()=>decodeJwtExp,
    "isProfileCompletedIn",
    ()=>isProfileCompletedIn,
    "setAuthCookies",
    ()=>setAuthCookies,
    "setAuthCookiesOnResponse",
    ()=>setAuthCookiesOnResponse,
    "setLoginTypeCookie",
    ()=>setLoginTypeCookie,
    "setProfileCompletedCookie",
    ()=>setProfileCompletedCookie,
    "setSessionIdCookie",
    ()=>setSessionIdCookie
]);
const ACCESS_COOKIE = "access";
const REFRESH_COOKIE = "refresh";
const PROFILE_COMPLETED_COOKIE = "profile_completed";
const SESSION_ID_COOKIE = "yp_session_id";
const LOGIN_TYPE_COOKIE = "login_type";
/** ~80 years — only for the COMPLETED state, which must survive a browser restart. */ const PROFILE_COMPLETED_MAX_AGE = 1000 * 60 * 60 * 24 * 365 * 80;
/** Fallback access-cookie maxAge (seconds) when no TTL can be derived. */ const DEFAULT_ACCESS_MAX_AGE = 60 * 60; // 1h
/** Fallback refresh-cookie maxAge (seconds) when no TTL can be derived. */ const DEFAULT_REFRESH_MAX_AGE = 60 * 60 * 24 * 7; // 7d
/**
 * The session id is only useful while the login it belongs to is alive, so it
 * tracks the refresh cookie's lifetime rather than inventing its own.
 */ const DEFAULT_SESSION_ID_MAX_AGE = DEFAULT_REFRESH_MAX_AGE;
function isProfileCompletedIn(store) {
    try {
        return store.get(PROFILE_COMPLETED_COOKIE)?.value === "true";
    } catch  {
        return false;
    }
}
/** Base options shared by every auth cookie. */ function baseOptions() {
    return {
        httpOnly: true,
        sameSite: "lax",
        secure: ("TURBOPACK compile-time value", "development") === "production",
        path: "/"
    };
}
function decodeJwtExp(token) {
    try {
        const parts = token.split(".");
        if (parts.length < 2) return null;
        const payload = parts[1];
        // base64url -> base64
        let b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
        const pad = b64.length % 4;
        if (pad === 2) b64 += "==";
        else if (pad === 3) b64 += "=";
        else if (pad === 1) return null;
        const json = typeof atob === "function" ? atob(b64) : Buffer.from(b64, "base64").toString("binary");
        const claims = JSON.parse(json);
        return typeof claims.exp === "number" && Number.isFinite(claims.exp) ? claims.exp : null;
    } catch  {
        return null;
    }
}
/**
 * Resolve a cookie maxAge (seconds) for a token: prefer an explicit
 * backend-provided `expires_in`, else derive `exp - now` from the JWT, else the
 * supplied fallback. Always returns a positive integer.
 */ function resolveMaxAge(token, explicitExpiresIn, fallback) {
    if (typeof explicitExpiresIn === "number" && Number.isFinite(explicitExpiresIn) && explicitExpiresIn > 0) {
        return Math.floor(explicitExpiresIn);
    }
    const exp = decodeJwtExp(token);
    if (exp !== null) {
        const seconds = exp - Math.floor(Date.now() / 1000);
        if (seconds > 0) return seconds;
    }
    return fallback;
}
function setAuthCookies(store, args) {
    const { access, refresh, expiresIn, refreshExpiresIn, profileCompleted } = args;
    const opts = baseOptions();
    // Onboarding unfinished → session cookies (dropped when the browser closes);
    // completed → the usual TTL-derived lifetime.
    const sessionOnly = args.sessionOnly ?? profileCompleted === false;
    store.set(ACCESS_COOKIE, access, {
        ...opts,
        ...sessionOnly ? {} : {
            maxAge: resolveMaxAge(access, expiresIn, DEFAULT_ACCESS_MAX_AGE)
        }
    });
    if (refresh) {
        store.set(REFRESH_COOKIE, refresh, {
            ...opts,
            ...sessionOnly ? {} : {
                maxAge: resolveMaxAge(refresh, refreshExpiresIn, DEFAULT_REFRESH_MAX_AGE)
            }
        });
    }
    if (typeof profileCompleted === "boolean") {
        setProfileCompletedCookie(store, profileCompleted);
    }
}
function setProfileCompletedCookie(store, completed) {
    store.set(PROFILE_COMPLETED_COOKIE, completed ? "true" : "false", {
        ...baseOptions(),
        ...completed ? {
            maxAge: PROFILE_COMPLETED_MAX_AGE
        } : {}
    });
}
function setSessionIdCookie(store, sessionId, opts = {}) {
    const { maxAge, sessionOnly } = opts;
    const resolved = typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0 ? Math.floor(maxAge) : DEFAULT_SESSION_ID_MAX_AGE;
    store.set(SESSION_ID_COOKIE, sessionId, {
        ...baseOptions(),
        ...sessionOnly ? {} : {
            maxAge: resolved
        }
    });
}
function setLoginTypeCookie(store, loginType, opts = {}) {
    const { maxAge, sessionOnly } = opts;
    const resolved = typeof maxAge === "number" && Number.isFinite(maxAge) && maxAge > 0 ? Math.floor(maxAge) : DEFAULT_REFRESH_MAX_AGE;
    store.set(LOGIN_TYPE_COOKIE, loginType, {
        ...baseOptions(),
        httpOnly: false,
        ...sessionOnly ? {} : {
            maxAge: resolved
        }
    });
}
function clearLoginTypeCookie(store) {
    store.delete(LOGIN_TYPE_COOKIE);
}
function clearSessionIdCookie(store) {
    store.delete(SESSION_ID_COOKIE);
}
function clearProfileCompletedCookie(store) {
    store.delete(PROFILE_COMPLETED_COOKIE);
}
function setAuthCookiesOnResponse(response, args) {
    setAuthCookies(response.cookies, args);
    return response;
}
function clearAuthCookies(store) {
    store.delete(ACCESS_COOKIE);
    store.delete(REFRESH_COOKIE);
    // The session id dies with the tokens it was issued against. Kept here rather
    // than at each call site so no teardown path can forget it and leave the next
    // login writing heartbeats onto a dead row.
    store.delete(SESSION_ID_COOKIE);
    store.delete(LOGIN_TYPE_COOKIE);
}
}),
"[project]/src/lib/callbackUrl.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "CALLBACK_URL_PARAM",
    ()=>CALLBACK_URL_PARAM,
    "appendCallbackUrl",
    ()=>appendCallbackUrl,
    "authUrlWithCallback",
    ()=>authUrlWithCallback,
    "buildCallbackFromCurrentLocation",
    ()=>buildCallbackFromCurrentLocation,
    "isSafeCallbackUrl",
    ()=>isSafeCallbackUrl,
    "readCallbackUrl",
    ()=>readCallbackUrl
]);
// Helpers for preserving the URL a user was trying to reach when they were
// bounced to /auth. Used by the email "accept connection" flow so a user who
// opens the link while logged out lands back on the same URL after login.
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$publicRoutes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/publicRoutes.ts [middleware] (ecmascript)");
;
const PARAM = "callbackUrl";
const AUTH_PREFIXES = [
    "/auth"
];
function isAuthPath(pathname) {
    return AUTH_PREFIXES.some((p)=>pathname === p || pathname.startsWith(`${p}/`));
}
function isSafeCallbackUrl(value) {
    if (!value) return false;
    if (!value.startsWith("/") || value.startsWith("//")) return false;
    const pathname = value.split("?")[0].split("#")[0];
    if (isAuthPath(pathname)) return false;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$publicRoutes$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isPublicRoute"])(pathname)) return false;
    return true;
}
function buildCallbackFromCurrentLocation() {
    if ("TURBOPACK compile-time truthy", 1) return null;
    //TURBOPACK unreachable
    ;
    const pathname = undefined, search = undefined, hash = undefined;
    const candidate = undefined;
}
function authUrlWithCallback(base = "/auth") {
    const callback = buildCallbackFromCurrentLocation();
    if (!callback) return base;
    const separator = base.includes("?") ? "&" : "?";
    return `${base}${separator}${PARAM}=${encodeURIComponent(callback)}`;
}
function readCallbackUrl(source) {
    if (!source) return null;
    const params = typeof source === "string" ? new URLSearchParams(source.startsWith("?") ? source.slice(1) : source) : source;
    const raw = params.get(PARAM);
    return isSafeCallbackUrl(raw) ? raw : null;
}
function appendCallbackUrl(params, callbackUrl) {
    if (isSafeCallbackUrl(callbackUrl)) {
        params.set(PARAM, callbackUrl);
    }
}
const CALLBACK_URL_PARAM = PARAM;
}),
"[project]/src/lib/clientMeta.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

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
/** Client-readable (NOT httpOnly) — DeviceIdSync mirrors it into localStorage. */ __turbopack_context__.s([
    "CLIENT_PLATFORM",
    ()=>CLIENT_PLATFORM,
    "CLIENT_PLATFORM_HEADER",
    ()=>CLIENT_PLATFORM_HEADER,
    "CLIENT_VERSION",
    ()=>CLIENT_VERSION,
    "CLIENT_VERSION_HEADER",
    ()=>CLIENT_VERSION_HEADER,
    "DEVICE_ID_COOKIE",
    ()=>DEVICE_ID_COOKIE,
    "DEVICE_ID_HEADER",
    ()=>DEVICE_ID_HEADER,
    "DEVICE_ID_MAX_AGE",
    ()=>DEVICE_ID_MAX_AGE,
    "buildClientHeaders",
    ()=>buildClientHeaders,
    "isValidDeviceId",
    ()=>isValidDeviceId,
    "newDeviceId",
    ()=>newDeviceId,
    "readDeviceId",
    ()=>readDeviceId,
    "serializeDeviceCookie",
    ()=>serializeDeviceCookie
]);
const DEVICE_ID_COOKIE = "yp_device_id";
const CLIENT_PLATFORM = "web";
const CLIENT_VERSION = ("TURBOPACK compile-time value", "0.1.0") || "0.1.0";
const CLIENT_PLATFORM_HEADER = "X-Client-Platform";
const DEVICE_ID_HEADER = "X-Device-Id";
const CLIENT_VERSION_HEADER = "X-Client-Version";
const DEVICE_ID_MAX_AGE = 60 * 60 * 24 * 365;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidDeviceId(value) {
    return typeof value === "string" && UUID_RE.test(value);
}
function newDeviceId() {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
    const bytes = new Uint8Array(16);
    if (c && typeof c.getRandomValues === "function") {
        c.getRandomValues(bytes);
    } else {
        for(let i = 0; i < 16; i++)bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = bytes[6] & 0x0f | 0x40; // version 4
    bytes[8] = bytes[8] & 0x3f | 0x80; // variant 10
    const hex = Array.from(bytes, (b)=>b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function readDeviceId(store) {
    if (!store) return null;
    try {
        const value = store.get(DEVICE_ID_COOKIE)?.value;
        return isValidDeviceId(value) ? value : null;
    } catch  {
        return null;
    }
}
function serializeDeviceCookie(deviceId) {
    const parts = [
        `${DEVICE_ID_COOKIE}=${deviceId}`,
        "Path=/",
        `Max-Age=${DEVICE_ID_MAX_AGE}`,
        "SameSite=Lax"
    ];
    if ("TURBOPACK compile-time falsy", 0) //TURBOPACK unreachable
    ;
    return parts.join("; ");
}
function buildClientHeaders(cookieStore, requestHeaders) {
    const out = {
        [CLIENT_PLATFORM_HEADER]: CLIENT_PLATFORM,
        [CLIENT_VERSION_HEADER]: CLIENT_VERSION
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
        } catch  {
        // Header bag unavailable in this context — platform/version still ship.
        }
    }
    return out;
}
}),
"[project]/src/lib/publicRoutes.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

// Routes that must be reachable without an authenticated session. Any API
// interceptor that would otherwise force-log-out an unauthenticated user
// should treat these paths as exempt.
__turbopack_context__.s([
    "ACCOUNT_ONLY_ROUTES",
    ()=>ACCOUNT_ONLY_ROUTES,
    "PUBLIC_ROUTES",
    ()=>PUBLIC_ROUTES,
    "isAccountOnlyPath",
    ()=>isAccountOnlyPath,
    "isPublicRoute",
    ()=>isPublicRoute
]);
const PUBLIC_ROUTES = [
    "/privacy-policy",
    "/terms-of-use"
];
function isPublicRoute(pathname) {
    if (!pathname) return false;
    return PUBLIC_ROUTES.some((route)=>pathname === route || pathname.startsWith(`${route}/`));
}
const ACCOUNT_ONLY_ROUTES = [
    "/messages",
    "/notifications",
    "/connections",
    "/blocked-users"
];
function isAccountOnlyPath(pathname) {
    if (!pathname) return false;
    return ACCOUNT_ONLY_ROUTES.some((route)=>pathname === route || pathname.startsWith(`${route}/`));
}
}),
"[project]/src/proxy.ts [middleware] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "config",
    ()=>config,
    "proxy",
    ()=>proxy
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$callbackUrl$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/callbackUrl.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authCookies$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/authCookies.ts [middleware] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$clientMeta$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/clientMeta.ts [middleware] (ecmascript)");
;
;
;
;
/** Refresh this many seconds BEFORE the token actually expires (clock skew). */ const ACCESS_EXPIRY_SKEW_SECONDS = 30;
/**
 * Upper bound for the refresh round-trip below. Every request (the page, the
 * session checks, data calls) waits on it, so an unanswered refresh used to
 * leave the whole page pending forever.
 */ const REFRESH_TIMEOUT_MS = 15000;
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
 */ function isAccessExpired(token) {
    const exp = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authCookies$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["decodeJwtExp"])(token);
    if (exp === null) return false;
    return exp - ACCESS_EXPIRY_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}
/**
 * Truly public routes (no auth required)
 */ const PUBLIC_PATHS = [
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
    "/terms-of-use"
];
function isPublicPath(pathname) {
    return PUBLIC_PATHS.some((p)=>pathname.startsWith(p));
}
/**
 * Account-only PAGES that still require authentication after the switch to
 * "pages are public by default". Everything not listed here is publicly
 * viewable (jobs, companies, events, feed, job/company/event details, other
 * users' profiles, etc.). Per-interaction gating is enforced client-side
 * (useAuthGate) and server-side (requireAuth).
 */ const ACCOUNT_ONLY_PATHS = [
    "/messages",
    "/notifications",
    "/connections",
    "/blocked-users"
];
function isAccountOnlyPath(pathname) {
    return ACCOUNT_ONLY_PATHS.some((p)=>pathname === p || pathname.startsWith(`${p}/`));
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
 */ const DISABLED_PATHS = [
    "/messages",
    "/connections"
];
function isDisabledPath(pathname) {
    return DISABLED_PATHS.some((p)=>pathname === p || pathname.startsWith(`${p}/`));
}
function redirectToAuth(req) {
    const url = new URL("/auth", req.url);
    const current = `${req.nextUrl.pathname}${req.nextUrl.search}`;
    if ((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$callbackUrl$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isSafeCallbackUrl"])(current)) {
        url.searchParams.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$callbackUrl$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CALLBACK_URL_PARAM"], current);
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(url);
}
async function proxy(req) {
    const existingDeviceId = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$clientMeta$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["readDeviceId"])(req.cookies);
    const deviceId = existingDeviceId ?? (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$clientMeta$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["newDeviceId"])();
    const minted = existingDeviceId === null;
    if (minted) {
        // Stamp it on the INCOMING request too, so THIS request's render and route
        // handlers can already read it via cookies() — not just the next one.
        req.cookies.set(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$clientMeta$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["DEVICE_ID_COOKIE"], deviceId);
    }
    const res = await route(req, minted);
    if (minted) {
        // Raw append, never res.cookies.set(): the refresh branch below replaces the
        // entire set-cookie header with the rotated auth cookies, and a
        // ResponseCookies write layered on top of that would re-serialize from a
        // stale parse and silently drop them.
        res.headers.append("set-cookie", (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$clientMeta$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["serializeDeviceCookie"])(deviceId));
    }
    return res;
}
async function route(req, minted) {
    const { pathname } = req.nextUrl;
    // ----------------------------------
    // Unreleased features — never render, never 404
    // ----------------------------------
    if (isDisabledPath(pathname)) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL("/home", req.url));
    }
    /**
   * NextResponse.next(), carrying the mutated request headers when a device id
   * was just minted — that is what makes the fresh cookie readable downstream
   * within this same request.
   */ const next = ()=>minted ? __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next({
            request: {
                headers: req.headers
            }
        }) : __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].next();
    const access = req.cookies.get("access")?.value;
    const refresh = req.cookies.get("refresh")?.value;
    const otpPending = req.cookies.get("otp_pending")?.value;
    const profileCompleted = req.cookies.get("profile_completed")?.value === "true";
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
        const origin = ("TURBOPACK compile-time value", "http://localhost:3000") || req.nextUrl.origin;
        let refreshRes;
        try {
            refreshRes = await fetch(`${origin}/api/auth/refresh`, {
                method: "POST",
                headers: {
                    Cookie: req.headers.get("cookie") || ""
                },
                signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS)
            });
        } catch (err) {
            // Timed out / unreachable: that says nothing about the tokens, so keep
            // them and let the request through instead of hanging or logging out.
            console.error("Token refresh did not answer:", err);
            return next();
        }
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
        const res = isAccountOnlyPath(pathname) || pathname.startsWith("/onboarding") ? redirectToAuth(req) : next();
        res.cookies.delete("access");
        res.cookies.delete("refresh");
        // The UserSession row this browser belonged to died with those tokens —
        // drop its id so the next login can't inherit it and write onto a dead row.
        (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$authCookies$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["clearSessionIdCookie"])(res.cookies);
        return res;
    }
    // ----------------------------------
    // Skip static files
    // ----------------------------------
    if (pathname.startsWith("/_next") || pathname.startsWith("/static") || pathname === "/favicon.ico" || pathname.startsWith("/icon") || pathname.startsWith("/apple-icon") || pathname.startsWith("/apple-touch-icon")) {
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
            const rawCallback = req.nextUrl.searchParams.get(__TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$callbackUrl$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["CALLBACK_URL_PARAM"]);
            const target = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$callbackUrl$2e$ts__$5b$middleware$5d$__$28$ecmascript$29$__["isSafeCallbackUrl"])(rawCallback) ? rawCallback : "/home";
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL(target, req.url));
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
            return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL("/home", req.url));
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
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$middleware$5d$__$28$ecmascript$29$__["NextResponse"].redirect(new URL("/onboarding", req.url));
    }
    // Public by default
    return next();
}
const config = {
    // `.well-known` is excluded so Apple's CDN and Google's App Links verifier
    // fetch the association files as plain statics — no cookie logic, no chance
    // of a redirect, which would silently break deep-link verification.
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|apple-touch-icon|\\.well-known).*)"
    ]
};
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__0dtxyoc._.js.map