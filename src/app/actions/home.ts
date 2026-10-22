"use server";

// Read Server Action for the public Home hero banner (REQUIREMENTS §4.4).
//
// The endpoint takes no payload and is browseable anonymously, so it follows
// the same shape as the other public lookups in src/app/actions/options.ts:
// a GET on the web API with soft auth (the bearer is attached when the visitor
// happens to be logged in, but it is never required).

import { api } from "@/lib/api";
import { EP } from "@/lib/endpoints";
import type { HomeBannerEnvelope } from "@/types/home";

/** GET /api/web/home-banner — ordered hero slides for the Home feed. */
export async function getHomeBannersAction() {
  return api.get<HomeBannerEnvelope>(EP.homeBanner, { auth: "soft" });
}
