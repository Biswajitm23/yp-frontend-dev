// src/types/home.ts

/** One slide of the Home hero banner (GET /api/web/home-banner). */
export interface HomeBanner {
  id: string;
  image_url: string;
  /**
   * Optional click-through target. `null` (or absent, on backend builds that
   * predate the field) means the slide's artwork is not clickable. Normalised
   * by fetchHomeBanners() before it reaches the slider.
   */
  external_link: string | null;
}

/** Verbatim backend body for GET /api/web/home-banner. */
export interface HomeBannerEnvelope {
  status: "OK" | "ERROR";
  message: string;
  data: HomeBanner[] | null;
}
