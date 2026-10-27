// src/app/api/server-info/route.ts
//
// TEMP: backend migration (VM -> Cloud Run) — remove after cutover
//
// Read-only probe for the BROWSER: which backend did the server-side switch
// resolve to right now? Returns ONLY the numeric code — never the URL — so the
// server-only base URLs stay server-only (nothing leaks to the client):
//   data.server === 0  -> SERVER_1 (old)
//   data.server === 1  -> SERVER_2 (new)
// ServerSwitchToast.tsx reads this once per launch to show which server the web
// is synced to. Delete this file on cutover (see docs/SERVER_SWITCH_MIGRATION.md).

import { NextResponse } from "next/server";
import { getBackendServerCode } from "@/lib/backendUrl";

// Always resolve fresh per request (the choice itself is still cached for 60s
// inside getBackendUrl); never let the route response be statically cached.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const server = await getBackendServerCode();
    return NextResponse.json({ status: "OK", data: { server } });
  } catch {
    // Any failure counts as the old server — matching the backend's "missing = 0".
    return NextResponse.json({ status: "OK", data: { server: 0 } });
  }
}
