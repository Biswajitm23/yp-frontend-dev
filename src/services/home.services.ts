// src/services/home.services.ts
//
// Public Home reads. Backed by the Server Action in src/app/actions/home.ts —
// no axios, no client tokenManager (the server gateway owns auth + refresh).

import { getHomeBannersAction } from "@/app/actions/home";
import type { HomeBanner } from "@/types/home";

/** Absolute http(s) target — safe to drop straight into an href. */
const HTTP_URL = /^https?:\/\//i;
/** Any scheme at all, e.g. "https:", but also "javascript:" and "data:". */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * `external_link` is typed by hand in the admin panel, so it arrives in every
 * shape an admin might type. Coerce it to something an href can carry, or to
 * null when it can't be trusted:
 *
 *  - "https://x.com/y"  → kept as-is
 *  - "//x.com/y"        → "https://x.com/y"  (protocol-relative)
 *  - "www.x.com/y"      → "https://www.x.com/y"  (a bare host would otherwise
 *                          resolve against the current page and 404)
 *  - "/events/123"      → kept as-is (same-origin path)
 *  - "javascript:..."   → null; no other scheme reaches an href
 */
const normalizeExternalLink = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const link = value.trim();
  if (!link) return null;
  if (link.startsWith("//")) return `https:${link}`;
  if (HTTP_URL.test(link) || link.startsWith("/")) return link;
  if (HAS_SCHEME.test(link)) return null;
  return `https://${link}`;
};

/**
 * Hero banner slides for the Home feed.
 *
 * Returns the slides already unwrapped from the backend envelope and filtered
 * down to the ones that actually carry an image, so the slider never has to
 * render a blank frame for a half-populated row. Each slide's optional
 * click-through target is normalised here too, so the slider only ever sees a
 * ready-to-use href or null.
 */
export const fetchHomeBanners = async (): Promise<HomeBanner[]> => {
  const res = await getHomeBannersAction();
  if (res.status !== "OK") {
    throw new Error(res.message || "Failed to fetch home banners");
  }
  const banners = res.data?.data ?? [];
  return banners
    .filter((banner) => Boolean(banner?.image_url))
    .map((banner) => ({
      ...banner,
      external_link: normalizeExternalLink(banner.external_link),
    }));
};
