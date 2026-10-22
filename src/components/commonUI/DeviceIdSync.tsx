"use client";

// src/components/commonUI/DeviceIdSync.tsx
//
// Mirrors the `yp_device_id` cookie into localStorage, so the web client exposes
// the same `localStorage.yp_device_id` the React Native clients keep in
// AsyncStorage. Handy for support ("read me your device id") and for anything
// client-side that later wants to tag an event without re-parsing cookies.
//
// WRITE-ONLY, AND DELIBERATELY SO
// -------------------------------
// It never restores the cookie FROM localStorage. Doing that would let a stale
// value from a previous visit overwrite the id src/proxy.ts already minted and
// already sent to the backend earlier in this very request — two different ids
// inside one page load. The cookie is the single source of truth; this is a
// mirror, not a backup.

import { useEffect } from "react";
import { DEVICE_ID_COOKIE, isValidDeviceId } from "@/lib/clientMeta";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  for (const part of document.cookie.split(";")) {
    const [rawKey, ...rest] = part.split("=");
    if (rawKey.trim() === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export default function DeviceIdSync() {
  useEffect(() => {
    try {
      const deviceId = readCookie(DEVICE_ID_COOKIE);
      if (!isValidDeviceId(deviceId)) return;
      if (window.localStorage.getItem(DEVICE_ID_COOKIE) === deviceId) return;
      window.localStorage.setItem(DEVICE_ID_COOKIE, deviceId);
    } catch {
      // Private mode / storage disabled. The cookie is what the backend reads,
      // so a failed mirror changes nothing that matters.
    }
  }, []);

  return null;
}
