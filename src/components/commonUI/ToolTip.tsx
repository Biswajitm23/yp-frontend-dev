"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  position?: "top" | "bottom" | "left" | "right" | "top-right";
  width?: string;
  className?: string; // NEW
  /**
   * Render the panel through a portal on <body> instead of inside the trigger.
   *
   * An absolutely positioned panel is CLIPPED by the nearest scrolling
   * ancestor (`overflow: auto/hidden`) — e.g. the Jobs sidebar
   * (`.sidebar_main_section`), which cut the top off the ⓘ tooltip. A portalled
   * panel is positioned against the trigger with `position: fixed`, so no
   * ancestor can crop it, and it flips below the trigger when there isn't room
   * above.
   *
   * Opt-in: every existing call site keeps the original in-flow behaviour.
   */
  portal?: boolean;
  /** Max width (px) of the portalled panel. Ignored unless `portal`. */
  portalMaxWidth?: number;
}

/** Gap between trigger and panel, and the minimum distance to a viewport edge. */
const GAP = 8;
const VIEWPORT_MARGIN = 8;

type Coords = { top: number; left: number; above: boolean };

export default function Tooltip({
  content,
  children,
  position = "top",
  width = "w-64",
  className = "",
  portal = false,
  portalMaxWidth = 260,
}: TooltipProps) {
  const positionClasses: Record<string, string> = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-2",
    left: "right-full top-1/2 -translate-y-1/2 mr-2",
    right: "left-full top-1/2 -translate-y-1/2 ml-2",
    "top-right": "bottom-full left-full mb-2 ml-2",
  };

  const panelLook =
    "rounded-lg bg-black text-white text-sm p-3 shadow-lg text-left transition-all duration-200";

  if (!portal) {
    return (
      <div className="relative inline-flex group">
        {children}

        <div
          className={`login-tooltip absolute ${positionClasses[position]} ${width}
          ${panelLook}
          opacity-0 scale-95 pointer-events-none
          group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto
          group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:pointer-events-auto
          z-50
          ${className}`}
        >
          {content}
        </div>
      </div>
    );
  }

  return (
    <PortalTooltip
      content={content}
      className={className}
      panelLook={panelLook}
      maxWidth={portalMaxWidth}
      preferBelow={position === "bottom"}
    >
      {children}
    </PortalTooltip>
  );
}

function PortalTooltip({
  content,
  children,
  className,
  panelLook,
  maxWidth,
  preferBelow,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
  className: string;
  panelLook: string;
  maxWidth: number;
  preferBelow: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  // Measured against the LIVE trigger rect, so the panel tracks the trigger
  // when an ancestor scrolls underneath it. Before the panel exists its own
  // size is unknown, so `maxWidth` stands in — that first pass is painted
  // transparent and corrected on the next frame.
  const measure = useCallback((): Coords | null => {
    const trigger = wrapperRef.current;
    if (!trigger) return null;

    const rect = trigger.getBoundingClientRect();
    const panelWidth = panelRef.current?.offsetWidth ?? maxWidth;
    const panelHeight = panelRef.current?.offsetHeight ?? 0;

    const roomAbove = rect.top - GAP - panelHeight >= VIEWPORT_MARGIN;
    const above = preferBelow ? false : roomAbove;

    // Centred on the trigger, then pulled back inside the viewport. The panel
    // is translated by -50% of its own width, so clamp on its half-width.
    const half = panelWidth / 2;
    const min = half + VIEWPORT_MARGIN;
    const max = window.innerWidth - half - VIEWPORT_MARGIN;
    const centre = rect.left + rect.width / 2;

    return {
      top: above ? rect.top - GAP : rect.bottom + GAP,
      left: max > min ? Math.min(Math.max(centre, min), max) : centre,
      above,
    };
  }, [maxWidth, preferBelow]);

  const show = useCallback(() => {
    setCoords(measure());
    setOpen(true);
  }, [measure]);

  const hide = useCallback(() => {
    setOpen(false);
    setVisible(false);
    setCoords(null);
  }, []);

  // Re-measure once the panel has real dimensions (then fade it in), and keep
  // it pinned while the page or any scrolling ancestor moves.
  useEffect(() => {
    if (!open) return;

    const reflow = () => setCoords(measure());
    const raf = requestAnimationFrame(() => {
      reflow();
      setVisible(true);
    });

    // `capture` so scrolling in an ancestor container counts, not just window.
    window.addEventListener("scroll", reflow, true);
    window.addEventListener("resize", reflow);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", reflow, true);
      window.removeEventListener("resize", reflow);
    };
  }, [open, measure]);

  const panel =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            role="tooltip"
            className={`${panelLook} ${className}`}
            style={{
              position: "fixed",
              top: coords?.top ?? -9999,
              left: coords?.left ?? -9999,
              // Positioning and the pop-in scale share `transform`, so they are
              // written together here rather than as utility classes.
              transform: `translate(-50%, ${coords?.above ? "-100%" : "0"}) scale(${
                visible ? 1 : 0.95
              })`,
              opacity: visible ? 1 : 0,
              width: "max-content",
              maxWidth,
              pointerEvents: "none",
              zIndex: 9999,
            }}
          >
            {content}
          </div>,
          document.body,
        )
      : null;

  return (
    <div
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      // React's onFocus/onBlur bubble, so focusing the trigger inside opens it —
      // this is what keeps the ⓘ reachable by keyboard and by tap.
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {panel}
    </div>
  );
}
