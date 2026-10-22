"use client";

import type { ReactNode } from "react";
import { useTheme } from "@/context/ThemeContext";

interface DetailNotFoundProps {
  /** Icon rendered inside the badge (e.g. a lucide <Briefcase />). */
  icon: ReactNode;
  title: string;
  message: string;
  /** Primary (gradient) action — e.g. "Browse Jobs". */
  primaryLabel: string;
  onPrimary: () => void;
  /** Optional secondary (outline) action. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/**
 * Shared "this item doesn't exist / was removed" empty state for id-based detail
 * pages (job, company, …). Rendered when the backend returns no record for the
 * requested id, so the page never shows a shell full of "?" placeholders.
 *
 * Static (no animations): a clean brand-tinted icon badge over a soft ambient
 * aurora glow, theme-aware, and self-contained (one scoped, dnf-prefixed <style>
 * block; no CSS modules / new deps). The page back button is provided by the
 * parent page header (matching every other detail page).
 */
export default function DetailNotFound({
  icon,
  title,
  message,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
}: DetailNotFoundProps) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";

  const primaryText = isLight ? "#040F1F" : "#ffffff";
  const mutedText = isLight ? "#5b6473" : "#a0aec0";

  const iconColor = isLight ? "#5433ff" : "#aab4ff";
  const badgeBg = isLight
    ? "linear-gradient(150deg, rgba(84,51,255,0.10), rgba(32,189,255,0.06))"
    : "linear-gradient(150deg, rgba(84,51,255,0.20), rgba(32,189,255,0.10))";
  const badgeBorder = isLight
    ? "1px solid rgba(84,51,255,0.22)"
    : "1px solid rgba(140,120,255,0.35)";

  const hasSecondary = Boolean(secondaryLabel && onSecondary);

  return (
    <div className="dnf-root">
      {/* Ambient brand-gradient aurora (decorative, static) */}
      <div className="dnf-aurora" aria-hidden="true">
        <span className="dnf-blob dnf-blob-a" />
        <span className="dnf-blob dnf-blob-b" />
        <span className="dnf-blob dnf-blob-c" />
      </div>

      <section className="dnf-card" role="status" aria-live="polite">
        {/* Clean, static brand-tinted icon badge */}
        <div
          className="dnf-icon-badge"
          aria-hidden="true"
        
        >
          <span className="dnf-icon">{icon}</span>
        </div>

        <h2
          className="dnf-title"
          style={{ color: primaryText, fontFamily: "var(--font-plus-jakarta)" }}
        >
          {title}
        </h2>

        <p
          className="dnf-message"
          style={{ color: mutedText, fontFamily: "var(--font-dm-sans)" }}
        >
          {message}
        </p>

        <div className="dnf-actions">
          {hasSecondary && (
            <button
              type="button"
              className="gradient-border-btn dnf-btn"
              onClick={onSecondary}
              style={{ color: primaryText }}
            >
              {secondaryLabel}
            </button>
          )}
          <button
            type="button"
            className="btn-gradient dnf-btn"
            onClick={onPrimary}
          >
            {primaryLabel}
          </button>
        </div>
      </section>

      <style>{`
        .dnf-root {
          position: relative;
          width: 100%;
          // min-height: 58vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 20px 64px;
          overflow: hidden;
        }
       
        .dnf-blob {
          position: absolute;
          border-radius: 50%;
          filter: blur(72px);
        }
        .dnf-blob-a {
          width: 340px; height: 340px;
          top: 2%; left: 12%;
          opacity: 0.5;
          
        }
        .dnf-blob-b {
          width: 340px; height: 340px;
          bottom: 0%; right: 10%;
          opacity: 0.5;
          
        }
        .dnf-blob-c {
          width: 260px; height: 260px;
          top: 38%; left: 46%;
          opacity: 0.3;
          transform: translateX(-50%);
          
        }

        .dnf-card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 460px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .dnf-icon-badge {
       
          border-radius: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 22px;
          
        }
        .dnf-icon {
          display: inline-flex;
          line-height: 0;
        }
        .dnf-icon :where(svg) {
          width: 32px;
          height: 32px;
        }

        .dnf-title {
          font-size: 22px;
          font-weight: 700;
          line-height: 1.25;
          margin: 0 0 8px;
        }
        .dnf-message {
          font-size: 14.5px;
          line-height: 1.6;
          margin: 0 0 26px;
          max-width: 340px;
        }

        .dnf-actions {
          display: flex;
          gap: 12px;
          justify-content: center;
          flex-wrap: wrap;
        }
        .dnf-btn {
          padding: 11px 24px;
          border-radius: 26px;
          font-family: var(--font-plus-jakarta);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
        }
        .dnf-btn:hover { transform: translateY(-1px); }
        .dnf-btn:active { transform: translateY(0); }
        .dnf-btn.btn-gradient:hover {
          box-shadow: 0 12px 28px -10px rgba(32,189,255,0.6);
        }
        .dnf-btn:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(84,51,255,0.5);
        }

        @media (max-width: 480px) {
          .dnf-actions { flex-direction: column-reverse; width: 100%; }
          .dnf-actions .dnf-btn { width: 100%; }
        }
      `}</style>
    </div>
  );
}
