"use client";

// "Generate the AI summary once every N days" guard. The last generation time
// is the backend profile field `ai_generation_time` (a local-timezone ISO
// timestamp written via update-profile) — the single source of truth. Nothing
// is kept in localStorage, so the limit is enforced across devices/browsers.
//
// The owner/dev account (UNRESTRICTED_SUMMARY_EMAILS) is exempt so it can be
// tested freely regardless of the last generation time.

import { useCallback } from "react";

export const SUMMARY_COOLDOWN_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Accounts exempt from the 30-day generation limit (developer/owner testing).
export const UNRESTRICTED_SUMMARY_EMAILS = ["biswajitm.bitpastel@gmail.com", "pradipta.bitpastel@gmail.com", "ibrahim.md@bitpastel.com" ];

export interface SummaryCooldownState {
  isLocked: boolean;
  daysRemaining: number;
  nextAllowedDate: string;
  projectedUnlockDate: string;
  todayDate: string;
}

const formatDate = (ms: number): string => {
  try {
    return new Date(ms).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
};

export function isUnrestrictedSummaryEmail(email?: string | null): boolean {
  if (!email) return false;
  return UNRESTRICTED_SUMMARY_EMAILS.includes(email.trim().toLowerCase());
}

// Current time as a local-timezone ISO string with offset, e.g.
// "2026-07-03T14:30:00+05:30" (India) or "…+01:00" (UK). The user can be in any
// country, so we keep their own offset; Date.parse() reads it back to the exact
// absolute instant, so the 30-day math stays timezone-safe wherever it runs.
export function getLocalGenerationTimestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const offsetMinutes = -now.getTimezoneOffset(); // +ve east of UTC
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` +
    `${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`
  );
}

export function useSummaryCooldown(
  aiGenerationTime?: string | null,
  email?: string | null,
) {
  // Computed on demand (inside click handlers) so nothing reads Date during
  // render — avoids any SSR/hydration mismatch.
  const compute = useCallback((): SummaryCooldownState => {
    const now = Date.now();

    // Owner/dev account → never locked.
    if (isUnrestrictedSummaryEmail(email)) {
      return {
        isLocked: false,
        daysRemaining: 0,
        nextAllowedDate: "",
        projectedUnlockDate: formatDate(now + SUMMARY_COOLDOWN_DAYS * MS_PER_DAY),
        todayDate: formatDate(now),
      };
    }

    const last = aiGenerationTime ? Date.parse(aiGenerationTime) : NaN;
    const nextAllowedMs = !Number.isNaN(last)
      ? last + SUMMARY_COOLDOWN_DAYS * MS_PER_DAY
      : null;
    const isLocked = nextAllowedMs != null && now < nextAllowedMs;
    const daysRemaining =
      nextAllowedMs != null
        ? Math.max(0, Math.ceil((nextAllowedMs - now) / MS_PER_DAY))
        : 0;
    return {
      isLocked,
      daysRemaining,
      nextAllowedDate: nextAllowedMs != null ? formatDate(nextAllowedMs) : "",
      projectedUnlockDate: formatDate(now + SUMMARY_COOLDOWN_DAYS * MS_PER_DAY),
      todayDate: formatDate(now),
    };
  }, [aiGenerationTime, email]);

  return { compute };
}
