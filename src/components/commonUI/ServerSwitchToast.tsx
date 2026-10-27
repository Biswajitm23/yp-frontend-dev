"use client";

// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
//
// Shows ONE toast per browser launch telling the user which backend the
// server-side switch resolved to, so we can visually confirm the frontend is
// synced to the server the backend selected:
//   server 0 -> "Server 1 connected"
//   server 1 -> "Server 2 connected"
// It reuses the app's existing react-toastify ToastContainer (configured once in
// src/app/layout.tsx) — no new styling or container. Reads the server number
// from /api/server-info (never the URL). Renders nothing. Delete this file on
// cutover (see docs/SERVER_SWITCH_MIGRATION.md).

import { useEffect } from "react";
import { toast } from "react-toastify";

// Guard so the toast fires once per launch, not on every client-side route
// change. sessionStorage resets on a fresh tab/session, which is the behaviour
// we want ("once per launch").
const ONCE_KEY = "yp_server_switch_toast_shown";

export default function ServerSwitchToast() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem(ONCE_KEY)) return;

    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/server-info", { cache: "no-store" });
        if (!res.ok) return;

        const body = await res.json().catch(() => null);
        const server = body?.data?.server;
        if (cancelled || (server !== 0 && server !== 1)) return;

        // Mark as shown only once we actually have a valid answer.
        sessionStorage.setItem(ONCE_KEY, "1");

        const label = server === 1 ? "Server 2 connected" : "Server 1 connected";
        toast.success(label);
      } catch {
        // A missing toast must never surface as an error — stay silent.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
