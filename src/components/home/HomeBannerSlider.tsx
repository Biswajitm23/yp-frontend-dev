"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import Autoplay from "embla-carousel-autoplay";
import Fade from "embla-carousel-fade";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeBanners } from "@/services/home.services";
import FallbackBanner from "../../../public/images/HomeBanner.jpeg";

// The artwork the backend serves is authored at 1400x250. Declaring it here
// keeps next/image's intrinsic ratio (and therefore the reserved height) the
// same as the static banner this slider replaced — no layout shift while the
// request is in flight.
const BANNER_WIDTH = 1400;
const BANNER_HEIGHT = 250;
const BANNER_SIZES = "(max-width: 1400px) 100vw, 1400px";

/** Dwell time on each slide before the carousel cross-fades to the next one. */
const AUTOPLAY_DELAY_MS = 8000;

/**
 * Cross-fade speed. This is Embla's `duration` — a unitless scroll-body
 * constant, NOT milliseconds — and the fade plugin derives its per-frame
 * opacity step from it, so a bigger number = a slower fade. Embla's default
 * (25) cross-fades a banner in ~200ms, which reads as a hard cut on artwork
 * this large; ~90 lands around 700ms, which is a visible dissolve while still
 * finishing well inside the 5s dwell above.
 */
const FADE_DURATION = 120;

/** Rounded frame shared by the skeleton, the fallback and the slider itself. */
const FRAME_CLASS = "relative w-full overflow-hidden rounded-2xl";

/**
 * Arrows are a hover affordance: invisible until the pointer is over the banner
 * (`focus-visible` keeps them reachable by keyboard too).
 *
 * On a touch screen there IS no hover, so `[@media(hover:none)]` drops them
 * entirely rather than leaving two permanent chevrons parked on the artwork —
 * on a phone the banner is small and they cover a real share of it. Touch
 * visitors still get the dots to jump between slides, plus the 5s autoplay.
 * `hidden` rather than `opacity-0` so they also leave the a11y tree and can't
 * be reached by a tap that a sticky :hover would otherwise leave live.
 */
const ARROW_CLASS =
  "absolute top-1/2 z-10 flex size-9 -translate-y-1/2 cursor-pointer items-center " +
  "justify-center rounded-full border-none bg-black/50 text-white opacity-0 " +
  "transition-[opacity,background-color] duration-200 hover:bg-black/70 " +
  "group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-white/70 [@media(hover:none)]:hidden";

function BannerImage({
  src,
  alt,
  priority,
}: {
  src: string | StaticImageData;
  alt: string;
  priority?: boolean;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      width={BANNER_WIDTH}
      height={BANNER_HEIGHT}
      sizes={BANNER_SIZES}
      priority={priority}
      className="h-auto w-full rounded-2xl object-cover"
    />
  );
}

/**
 * Wraps a slide's artwork in its click-through target when the backend sent
 * one, and renders the artwork bare when it didn't — so a slide with no
 * `external_link` keeps its default (non-clickable) cursor instead of looking
 * like a dead link.
 *
 * Safe to put on every slide: the fade plugin sets `pointer-events: none` on
 * any slide below half opacity, so the links behind the visible slide can't
 * swallow a click meant for it.
 */
function BannerLink({
  href,
  children,
}: {
  href: string | null;
  children: React.ReactNode;
}) {
  if (!href) return <>{children}</>;
  return (
    // The image supplies the link's accessible name via its alt text.
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block cursor-pointer rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
    >
      {children}
    </a>
  );
}

const HomeBannerSlider = () => {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["home-banners"],
    queryFn: fetchHomeBanners,
    staleTime: 1000 * 60 * 10,
  });

  const banners = data ?? [];

  const [api, setApi] = useState<CarouselApi>();
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!api) return;
    const onSelect = () => setSelectedIndex(api.selectedScrollSnap());
    onSelect();
    api.on("select", onSelect).on("reInit", onSelect);
    return () => {
      api.off("select", onSelect).off("reInit", onSelect);
    };
  }, [api]);

  const plugins = useMemo(
    () => [
      // Cross-fade instead of Embla's default horizontal translate.
      Fade(),
      Autoplay({
        delay: AUTOPLAY_DELAY_MS,
        // Hovering is what reveals the arrows — i.e. the moment the visitor
        // takes over — so pause there and resume on mouse-leave. Resuming needs
        // stopOnInteraction:false; the plugin's default `true` would stop
        // autoplay permanently the first time the pointer touches the banner.
        stopOnInteraction: false,
        stopOnMouseEnter: true,
      }),
    ],
    [],
  );

  // Manual navigation does NOT touch the autoplay timer, so a keyboard-driven
  // change landing late in the 5s window would otherwise be followed almost
  // immediately by an auto-advance. This mostly covers the keyboard path — a
  // MOUSE click on an arrow/dot implies the pointer is over the banner, where
  // autoplay is already paused, and `reset()` deliberately no-ops while paused
  // so it can never restart playback behind the visitor's back.
  const resetAutoplay = useCallback(() => {
    api?.plugins().autoplay?.reset();
  }, [api]);

  // `loop: true` below means prev/next always wrap, so neither arrow is ever
  // disabled and the shadcn canScrollPrev/Next flags aren't needed here.
  const scrollPrev = useCallback(() => {
    api?.scrollPrev();
    resetAutoplay();
  }, [api, resetAutoplay]);

  const scrollNext = useCallback(() => {
    api?.scrollNext();
    resetAutoplay();
  }, [api, resetAutoplay]);

  const scrollTo = useCallback(
    (index: number) => {
      api?.scrollTo(index);
      resetAutoplay();
    },
    [api, resetAutoplay],
  );

  // Reserve the banner's height while the first fetch resolves.
  if (isLoading) {
    return (
      <Skeleton
        className="w-full rounded-2xl"
        style={{ aspectRatio: `${BANNER_WIDTH} / ${BANNER_HEIGHT}` }}
      />
    );
  }

  // Nothing configured (or the read failed) → keep the bundled artwork rather
  // than leaving a hole at the top of the feed.
  if (isError || banners.length === 0) {
    return (
      <div className={FRAME_CLASS}>
        <BannerImage src={FallbackBanner} alt="Young Professionals" priority />
      </div>
    );
  }

  // A single slide needs no slider chrome at all.
  if (banners.length === 1) {
    return (
      <div className={FRAME_CLASS}>
        <BannerLink href={banners[0].external_link}>
          <BannerImage src={banners[0].image_url} alt="Home banner" priority />
        </BannerLink>
      </div>
    );
  }

  return (
    <Carousel
      // watchDrag: false — the visitor changes slides with the arrows/dots
      // only, never with a swipe or drag. Advancing on its own every 5s is the
      // Autoplay plugin's job (see `plugins`), which is independent of drag.
      opts={{ loop: true, watchDrag: false, duration: FADE_DURATION }}
      plugins={plugins}
      setApi={setApi}
      className={`${FRAME_CLASS} group`}
      aria-label="Home banners"
    >
      {/* ml-0 / pl-0 drop the shadcn inter-slide gutter: faded slides sit on
          top of each other, so a gap would only inset the artwork. */}
      <CarouselContent className="ml-0">
        {banners.map((banner, index) => (
          <CarouselItem key={banner.id} className="pl-0">
            <BannerLink href={banner.external_link}>
              <BannerImage
                src={banner.image_url}
                alt={`Home banner ${index + 1} of ${banners.length}`}
                priority={index === 0}
              />
            </BannerLink>
          </CarouselItem>
        ))}
      </CarouselContent>

      <button
        type="button"
        aria-label="Previous banner"
        onClick={scrollPrev}
        className={`${ARROW_CLASS} left-3`}
      >
        <ChevronLeft size={18} strokeWidth={2.5} />
      </button>
      <button
        type="button"
        aria-label="Next banner"
        onClick={scrollNext}
        className={`${ARROW_CLASS} right-3`}
      >
        <ChevronRight size={18} strokeWidth={2.5} />
      </button>

      {/* Position readout. Bottom-RIGHT rather than bottom-centre: the artwork
          is centre-composed (headline + strapline), so a centred dot row lands
          on top of the strapline. The drop shadow keeps the dots legible over
          the bright lightning artwork. */}
      <div className="absolute right-4 bottom-3 z-10 flex items-center gap-2">
        {banners.map((banner, index) => (
          <button
            key={banner.id}
            type="button"
            aria-label={`Go to banner ${index + 1}`}
            aria-current={index === selectedIndex}
            onClick={() => scrollTo(index)}
            className={`h-1.5 cursor-pointer rounded-full shadow-[0_0_4px_rgba(0,0,0,0.65)] transition-all duration-300 ${
              index === selectedIndex
                ? "w-5 bg-white"
                : "w-1.5 bg-white/60 hover:bg-white/90"
            }`}
          />
        ))}
      </div>
    </Carousel>
  );
};

export default HomeBannerSlider;
