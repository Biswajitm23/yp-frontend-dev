// components/profile/educationEntries.tsx
// Shared building blocks for the Education card. The editable version
// (EducationCard, own profile) and the read-only version
// (ReadOnlyEducationCard, another user's profile) both consume these so the
// two cards can never drift apart in mapping or in layout.
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "../../moduleCss/profile.module.css";
import courseData from "@/data/courses.json";
import { isContextualStatus, getCareerStatusNameById } from "@/helpers/careerStatus";
import { type Education } from "@/app/hooks/useUserProfile";

export interface EducationEntryRow {
  key: string;
  id?: string;
  careerStatus: string; // user-facing name (e.g. "At university")
  university: string;
  degree: string;
  customCourseName: string;
  startYear: string;
  endYear: string;
  currentSituation: string;
}

export interface EducationSource {
  // New multi-education list. The flat fields below are the transition-safe
  // fallback for payloads that haven't switched to `educations[]` yet.
  educations?: Education[];
  university?: string;
  degree?: string;
  duration?: string; // format: "YYYY - YYYY"
  careerStatus?: string;
  currentSituation?: string;
}

/**
 * Build entry rows: prefer the new `educations` list; otherwise seed a single
 * entry from the flat fields (so the card is never empty for old payloads).
 */
export function buildEducationEntries({
  educations,
  university,
  degree,
  duration,
  careerStatus,
  currentSituation,
}: EducationSource): EducationEntryRow[] {
  if (Array.isArray(educations) && educations.length > 0) {
    return educations.map((e, i) => {
      const statusName = getCareerStatusNameById(e.education_status ?? "");
      const savedDegree = e.education || e.degree || "";
      const isKnown =
        !savedDegree ||
        courseData.courses.some(
          (c) => c.name.toLowerCase() === savedDegree.toLowerCase(),
        );
      return {
        key: e.id ?? `srv-${i}`,
        id: e.id,
        careerStatus: statusName,
        university: e.place_of_study || "",
        degree: isKnown ? savedDegree : savedDegree ? "Other" : "",
        customCourseName: isKnown ? "" : savedDegree || "",
        startYear: e.start_year ? String(e.start_year).slice(-4) : "",
        endYear: e.end_year ? String(e.end_year).slice(-4) : "",
        // current_situation now lives on each education item (the API moved it
        // out of the top-level profile field), so read it per-entry.
        currentSituation: e.current_situation || "",
      };
    });
  }

  const hasFlat =
    (university && university.trim()) ||
    (degree && degree.trim()) ||
    (careerStatus && careerStatus.trim());
  if (hasFlat) {
    let start = "";
    let end = "";
    if (duration && duration.includes("-")) {
      const parts = duration.split("-").map((v) => v.trim());
      start = parts[0] === "Not Provided" ? "" : parts[0];
      end = parts[1] ?? "";
    }
    const savedDegree = degree || "";
    const isKnown =
      !savedDegree ||
      courseData.courses.some(
        (c) => c.name.toLowerCase() === savedDegree.toLowerCase(),
      );
    return [
      {
        key: "primary",
        careerStatus: careerStatus || "",
        university: university || "",
        degree: isKnown ? savedDegree : savedDegree ? "Other" : "",
        customCourseName: isKnown ? "" : savedDegree || "",
        startYear: start,
        endYear: end,
        currentSituation: isContextualStatus(careerStatus || "")
          ? currentSituation || ""
          : "",
      },
    ];
  }
  return [];
}

/**
 * The profile carries a SINGLE shared "Current Situation", copied onto every
 * contextual entry. Show it exactly once — on the most-recently-added (last)
 * contextual entry — so it never renders twice.
 */
export function getJourneyEntryKey(entries: EducationEntryRow[]): string | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (
      isContextualStatus(entries[i].careerStatus) &&
      entries[i].currentSituation.trim()
    ) {
      return entries[i].key;
    }
  }
  return null;
}

/** "Other" courses display the free-text course name the user typed. */
export function educationCourseLabel(row: EducationEntryRow): string {
  return row.degree?.toLowerCase() === "other" && row.customCourseName?.trim()
    ? row.customCourseName
    : row.degree;
}

// Status glyph (ID-card icon) used by the education entry header.
export function StatusIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M0 0h24v24H0z" fill="none" />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.561 2.25h2.879c.113 0 .201 0 .285.005a2.75 2.75 0 0 1 2.385 1.72c.032.077.06.16.095.268l.032.097l.03.085c.177.49.613.83 1.068.875l.1.006c1.677.099 2.966.378 3.924 1.335c.748.749 1.08 1.698 1.238 2.87c.153 1.14.153 2.595.153 4.433v.112c0 1.838 0 3.294-.153 4.433c-.158 1.172-.49 2.121-1.238 2.87c-.749.748-1.698 1.08-2.87 1.238c-1.14.153-2.595.153-4.433.153H9.944c-1.838 0-3.294 0-4.433-.153c-1.172-.158-2.121-.49-2.87-1.238c-.748-.749-1.08-1.698-1.238-2.87c-.153-1.14-.153-2.595-.153-4.433v-.112c0-1.838 0-3.294.153-4.433c.158-1.172.49-2.121 1.238-2.87c.958-.957 2.248-1.236 3.924-1.335l.1-.006c.455-.044.892-.385 1.07-.875l.028-.085l.032-.097c.036-.107.064-.191.095-.269a2.75 2.75 0 0 1 2.385-1.719c.084-.005.172-.005.286-.005m-3.92 4.554q.068-.002.133-.008C7.647 6.75 8.697 6.75 10 6.75h4c1.303 0 2.353 0 3.226.046q.066.006.132.008c1.604.095 2.398.356 2.94.898a2.3 2.3 0 0 1 .477.7c-1.827 1.186-3.028 1.95-4.038 2.456A.75.75 0 0 0 15.25 11v.458c-2.12.64-4.38.64-6.5 0V11a.75.75 0 0 0-1.487-.142c-1.01-.505-2.21-1.27-4.038-2.457a2.3 2.3 0 0 1 .477-.7c.542-.541 1.336-.802 2.94-.897m-3.78 3.149c-.11.996-.111 2.286-.111 4.047c0 1.907.002 3.262.14 4.29c.135 1.005.389 1.585.812 2.008s1.003.677 2.009.812c1.028.138 2.382.14 4.289.14h4c1.907 0 3.262-.002 4.29-.14c1.005-.135 1.585-.389 2.008-.812s.677-1.003.812-2.009c.138-1.027.14-2.382.14-4.289c0-1.76-.001-3.05-.11-4.047c-1.887 1.223-3.181 2.032-4.39 2.552V13a.75.75 0 0 1-1.5.016a12.75 12.75 0 0 1-6.5 0A.75.75 0 0 1 7.25 13v-.495c-1.208-.52-2.503-1.33-4.39-2.552m12.131-4.702l-.971-.001H9.009a3 3 0 0 0 .174-.428l.003-.008l.026-.077a4 4 0 0 1 .07-.203a1.25 1.25 0 0 1 1.084-.782c.032-.002.072-.002.215-.002h2.838c.143 0 .183 0 .215.002c.482.03.904.334 1.085.782c.012.03.024.067.07.203l.028.085m.039.113q.058.163.136.316z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Small "route/journey" glyph for the Current Situation label.
export function JourneyIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 21V4m0 0h11l-2.2 3L16 10H5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * "Current Situation" section: a labelled paragraph clamped to 2 lines with a
 * Show More / Show Less toggle that only appears when the text actually
 * overflows those 2 lines.
 */
export function EducationJourney({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const textRef = useRef<HTMLParagraphElement | null>(null);

  // Measured while collapsed (the 2-line clamp is applied on the first render,
  // when `expanded` is false), so overflow ⇒ the toggle is needed. We don't
  // re-measure on expand, so the toggle stays available to collapse again.
  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    setNeedsToggle(el.scrollHeight - el.clientHeight > 1);
  }, [text]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <p
        className={styles.location_text}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: 0,
          fontSize: "13px",
        }}
      >
        <JourneyIcon />
        Current Situation
      </p>
      <p
        ref={textRef}
        className={styles.profile_info}
        style={{
          margin: 0,
          fontSize: "12.7px",
          lineHeight: 1.5,
          whiteSpace: "pre-line",
          wordBreak: "break-word",
          ...(expanded
            ? {}
            : {
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }),
        }}
      >
        {text}
      </p>
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            fontSize: "12px",
            fontWeight: 600,
            color: "#3b82f6",
          }}
        >
          {expanded ? "Show Less" : "Show More"}
        </button>
      )}
    </div>
  );
}
