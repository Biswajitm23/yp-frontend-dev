// src/components/commonUI/SessionHeartbeat.tsx
//
// Client half of the UserSession heartbeat (SESSION_TRACKING_CLIENT_GUIDE §3).
// Mounted once from Providers.tsx.
//
// Every ping is an empty POST to the BFF route, which reads the httpOnly
// `access` / `yp_session_id` cookies itself — this component never sees a
// session id and cannot forge one. Only the access cookie gates the call: a
// ping with no session id still reaches the backend, which opens a row for
// this visit and returns its id for the route to store. So the timer keeps
// running while logged out (a cheap same-origin no-op) and self-heals on the
// first tick after a login, a browser restart, or an idle timeout.
//
// Guide rules implemented here:
//   - every 3 minutes, only while the tab is visible
//   - one immediate ping on becoming visible, one final ping on being hidden
//   - a beacon on pagehide so a closing tab still records its last moment
//   - fire and forget: no error UI, no retry, silent on failure

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isPublicRoute } from "@/lib/publicRoutes";

const HEARTBEAT_URL = "/api/auth/session/heartbeat";
const HEARTBEAT_INTERVAL_MS = 3 * 60 * 1000;

function sendHeartbeat() {
  // keepalive lets the "final ping on hide" survive the tab being backgrounded
  // mid-request. Errors are swallowed by design — the next tick covers it.
  fetch(HEARTBEAT_URL, {
    method: "POST",
    credentials: "include",
    keepalive: true,
  }).catch(() => {});
}

export default function SessionHeartbeat() {
  const pathname = usePathname();
  // Same gate as ThemeSync: public pages are for logged-out visitors, and a
  // heartbeat there would be a guaranteed no-op every 3 minutes.
  if (isPublicRoute(pathname)) {
    return null;
  }
  return <SessionHeartbeatInner />;
}

function SessionHeartbeatInner() {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const start = () => {
      stop();
      sendHeartbeat();
      timer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        // Hiding: one final ping so last_active_at reflects the moment the
        // user actually left, then stop — a background timer that keeps
        // pinging would make every session look infinitely long.
        sendHeartbeat();
        stop();
      }
    };

    const onPageHide = () => {
      // The tab is going away; fetch may be cancelled but a beacon is queued
      // by the browser and outlives the page. It carries the same-origin
      // cookies, which is all the BFF route needs.
      try {
        navigator.sendBeacon(HEARTBEAT_URL);
      } catch {
        // sendBeacon unavailable — the idle sweep closes the session at its
        // last heartbeat, at most 3 minutes short. Acceptable per the guide.
      }
      stop();
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      stop(); // React 18 StrictMode mounts twice in dev; without this cleanup
              // two timers would double every session's heartbeat rate.
    };
  }, []);

  return null;
}
