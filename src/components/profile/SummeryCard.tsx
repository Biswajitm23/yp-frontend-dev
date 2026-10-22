"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, Clock, FileText, Sparkles, X } from "lucide-react";
import styles from "../../moduleCss/profile.module.css";
import SummaryGeneratorModal from "./AISummery/SummeryGenerationModal";
import {
  useSummaryCooldown,
  getLocalGenerationTimestamp,
  type SummaryCooldownState,
} from "./AISummery/useSummaryCooldown";
import { useUserProfile, USER_PROFILE_QUERY_KEY } from "@/app/hooks/useUserProfile";
import { useUpdateProfile } from "@/app/hooks/useUpdateProfile";
import { buildProfilePreservePayload } from "@/services/profile.services";
import { useAuth } from "@/context/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "react-toastify";
import { addAISummary } from "@/services/ai_summary.services";
import styles_ai from "../../moduleCss/ai_summary.module.css";
import ConfirmModal from "@/components/commonUI/ConfirmModal";
import UnsavedChangesModal from "@/components/commonUI/UnsavedChangesModal";
import { useTheme } from "@/context/ThemeContext";
import { useAuthGate } from "@/app/hooks/useAuthGate";
import { isUnauthenticatedError } from "@/lib/authError";
import CVActions from "./cv/CVActions";
import type { CvData } from "./cv/pdfFormatter";

// ─── Strip Markdown for Editing ──────────────────────────────────────────────

function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => {
      if (line.startsWith("## ")) return line.slice(3);
      if (line.startsWith("### ")) return line.slice(4);
      if (line.startsWith("# ")) return line.slice(2);
      if (line.startsWith("• ") || line.startsWith("\u2022 "))
        return line.replace(/^[•\u2022]\s*/, "- ");
      return line;
    })
    .join("\n")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1");
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────

function renderInlineMd(
  text: string,
  _accentColor: string,
  isLight: boolean,
): React.ReactNode[] {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong
        key={i}
        style={{ color: isLight ? "#1e293b" : "#ffffff", fontWeight: 600 }}
      >
        {part}
      </strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function normalizeMd(text: string): string {
  // Drop trailing empty "SKILLS:" / "SUMMARY:" section labels: the AI output
  // sometimes emits the label with no content under it, which renders as a
  // bare heading at the bottom of the card.
  const isSectionLabel = (s: string) =>
    /^(SKILLS|SUMMARY):?\s*$/.test(s.trim());
  const isFiller = (s: string) =>
    s.trim() === "" || /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(s);

  const rawLines = text.split("\n");
  // Walk from the end, drop label lines that have no real content after them.
  let endIdx = rawLines.length;
  while (endIdx > 0) {
    const last = rawLines[endIdx - 1];
    if (isFiller(last)) {
      endIdx--;
      continue;
    }
    if (isSectionLabel(last)) {
      endIdx--;
      continue;
    }
    break;
  }
  const lines = rawLines.slice(0, endIdx);
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    // "## Heading — inline content" → split
    if (trimmed.startsWith("## ")) {
      const m = trimmed.match(/^(##\s+.+?)\s*[—–]\s*(.+)$/);
      if (m) {
        out.push(m[1].trim());
        if (m[2].trim()) out.push(m[2].trim());
        i++;
        continue;
      }
    }
    // Orphan bullet → combine with next line
    if (/^[•·●]\s*$/.test(trimmed) && i + 1 < lines.length) {
      out.push(`- ${lines[i + 1].trim()}`);
      i += 2;
      continue;
    }
    // Title-case section without ## (e.g. "Key Skills")
    if (/^([A-Z][a-z]+ ){1,4}[A-Z][a-z]+$/.test(trimmed)) {
      out.push(`## ${trimmed}`);
      i++;
      continue;
    }
    // "Section Name —" with trailing dash
    if (/^[A-Z][^#\n]+[—–]\s*$/.test(trimmed)) {
      out.push(`## ${trimmed.replace(/\s*[—–]\s*$/, "")}`);
      i++;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

function renderMarkdown(text: string, accentColor: string, isLight = false) {
  if (!text)
    return (
      <p style={{ fontSize: "13px", color: "#888", margin: 0 }}>
        Build Your Profile Summary with Dan AI
      </p>
    );
  // Dark mode uses a single uniform white (#fff) for ALL text content so the
  // summary reads as one consistent colour (per design feedback). Light mode
  // keeps its existing muted greys. Decorative accents (the section bar and
  // bullet dots) stay blue — only the text is unified.
  const textColor = isLight ? "#888888" : "#ffffff";
  const bodyColor = isLight ? "#888888" : "#ffffff";
  // White-ish colour for the Skills list values only (the blue dot and the
  // "Skills" heading are kept blue).
  const skillValueColor = isLight ? "#1e293b" : "#ffffff";

  const lines = normalizeMd(text).split("\n");
  // Track the current section for each line so ONLY the Skills list renders
  // white; every other section keeps its existing styling.
  let section = "";
  const lineSection = lines.map((line) => {
    const t = line.trim();
    if (/^(SKILLS|SUMMARY):?\s*$/.test(t))
      section = t.replace(/:$/, "").toLowerCase();
    else if (t.startsWith("### ")) section = t.slice(4).trim().toLowerCase();
    else if (t.startsWith("## ")) section = t.slice(3).trim().toLowerCase();
    else if (t.startsWith("# ")) section = "";
    return section;
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
      {lines.map((line, i) => {
          const inSkills = lineSection[i].includes("skill");
          // SKILLS: / SUMMARY: section label
          if (/^(SKILLS|SUMMARY):?\s*$/.test(line.trim())) {
            return (
              <div
                key={i}
                style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: isLight ? "rgba(148,163,184,0.5)" : "#ffffff",
                  marginTop: i === 0 ? 0 : "14px",
                  marginBottom: "2px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {line.trim().replace(/:$/, "")}
              </div>
            );
          }
          // Stray standalone "#" line → render nothing.
          if (line.trim() === "#") return null;
          // H1 title (e.g. "# Student Profile Summary") → white, slightly larger.
          if (line.startsWith("# ")) {
            return (
              <div
                key={i}
                style={{
                  fontSize: "15px",
                  fontWeight: 700,
                  color: isLight ? "#1e293b" : "#fff",
                  marginTop: i === 0 ? 0 : "12px",
                  marginBottom: "5px",
                }}
              >
                {renderInlineMd(line.slice(2), accentColor, isLight)}
              </div>
            );
          }
          if (line.startsWith("## ")) {
            // Mobile-style section header: a vertical blue gradient bar, the
            // section title, then a thin rule filling the remaining width.
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginTop: i === 0 ? 0 : "16px",
                  marginBottom: "8px",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    width: "4px",
                    height: "18px",
                    borderRadius: "2px",
                    background:
                      "linear-gradient(180deg, #5433ff 0%, #20bdff 100%)",
                  }}
                />
                <span
                  style={{
                    fontSize: "15px",
                    fontWeight: 700,
                    textTransform: "capitalize",
                    color: isLight ? "#1e293b" : "#ffffff",
                    whiteSpace: "nowrap",
                  }}
                >
                  {renderInlineMd(line.slice(3), accentColor, isLight)}
                </span>
                <span
                  style={{
                    flex: 1,
                    height: "1px",
                    background: isLight
                      ? "rgba(0,0,0,0.08)"
                      : "rgba(255,255,255,0.12)",
                  }}
                />
              </div>
            );
          }
          if (line.startsWith("### ")) {
            return (
              <div
                key={i}
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "capitalize",
                  color: isLight ? accentColor : "#ffffff",
                  marginTop: i === 0 ? 0 : "8px",
                  marginBottom: "3px",
                }}
              >
                {renderInlineMd(line.slice(4), accentColor, isLight)}
              </div>
            );
          }
          // Dash or star bullets
          if (/^[-*]\s+/.test(line) || /^[•·●\u2022]\s+/.test(line)) {
            const content = line.replace(/^[-*•·●\u2022]\s+/, "");
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                }}
              >
                <span
                  style={{
                    flexShrink: 0,
                    marginTop: "6px",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    background: accentColor,
                    display: "inline-block",
                  }}
                />
                <span
                  style={{
                    fontSize: "13px",
                    lineHeight: "1.65",
                    color: inSkills ? skillValueColor : bodyColor,
                  }}
                >
                  {renderInlineMd(
                    content,
                    inSkills ? skillValueColor : accentColor,
                    isLight,
                  )}
                </span>
              </div>
            );
          }
          if (line.trim() === "")
            return <div key={i} style={{ height: "4px" }} />;
          // Markdown horizontal rules (---, ___, ***) — AI output sometimes
          // tails these on; render nothing so they don't show as literal "---".
          if (/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line))
            return null;
          return (
            <div
              key={i}
              style={{ fontSize: "13px", lineHeight: "1.7", color: textColor }}
            >
              {renderInlineMd(line, accentColor, isLight)}
            </div>
          );
        })}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SummaryCard() {
  const { data: profileQueryData } = useUserProfile();
  const raw = profileQueryData?.data;

  const { ensureAuthed, openGate, gateModal: authGateModal } = useAuthGate();

  const userName: string = raw?.first_name ?? "";

  // Education context for the AI: prefer the full `educations[]` list (course +
  // institution + years), falling back to the flat college/study_field fields.
  // Used both to generate the summary and to help the CV pre-fill fill in
  // education/skills answers from the profile as well as the CV.
  const educationContext: string[] = (() => {
    const lines: string[] =
      Array.isArray(raw?.educations) && raw.educations.length > 0
        ? raw.educations
            .map((e: any) => {
              const years =
                e?.start_year && e?.end_year
                  ? `${String(e.start_year).slice(-4)}-${String(e.end_year).slice(-4)}`
                  : "";
              return [e?.education || e?.degree, e?.place_of_study, years]
                .filter(Boolean)
                .join(", ");
            })
            .filter(Boolean)
        : ([raw?.college, raw?.study_field].filter(Boolean) as string[]);
    // Surface the current field of study so "what are you currently studying?"
    // style questions can be answered from the profile as well as the CV.
    if (
      raw?.study_field &&
      !lines.some((l) => l.toLowerCase().includes(String(raw.study_field).toLowerCase()))
    ) {
      lines.push(`Currently studying: ${raw.study_field}`);
    }
    return lines.filter(Boolean);
  })();

  const skillsContext: string[] = Array.isArray(raw?.skills)
    ? raw.skills.map((s: any) => (typeof s === "string" ? s : s?.name ?? "")).filter(Boolean)
    : [];

  const modalProfileData = {
    name:
      [raw?.first_name, raw?.last_name].filter(Boolean).join(" ") ||
      raw?.full_name ||
      "",
    location: raw?.location ?? undefined,
    education: educationContext,
    existingSkills: skillsContext,
  };

  const [showModal, setShowModal] = useState(false);
  // "Use my CV" vs "Fill manually" choice (only shown when a CV is uploaded).
  const [showCvChoiceModal, setShowCvChoiceModal] = useState(false);
  // Whether the opened builder should pre-fill answers from the uploaded CV.
  const [prefillFromCv, setPrefillFromCv] = useState(true);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showLockModal, setShowLockModal] = useState(false);
  const [cooldownInfo, setCooldownInfo] = useState<SummaryCooldownState | null>(
    null,
  );

  const { user } = useAuth();
  // Logged-in email drives the owner/dev bypass; fall back to the profile email.
  const currentEmail = user?.email ?? raw?.email ?? null;

  const queryClient = useQueryClient();
  const updateProfileMutation = useUpdateProfile();

  // 30-day limit is enforced from the backend `ai_generation_time` field (a
  // local-timezone timestamp) — never localStorage.
  const { compute: computeCooldown } = useSummaryCooldown(
    raw?.ai_generation_time,
    currentEmail,
  );
  // Edit mode lives here (not in InlineField) so the trigger can sit up in the
  // header row next to Regenerate/Download/Copy.
  const [editingSummary, setEditingSummary] = useState(false);

  // Auto-open the generation modal when the user is routed here from the
  // pre-apply gate (useApplyGate) via `?openSummary=1`. After triggering, the
  // param is stripped so refresh doesn't re-trigger.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (autoOpenedRef.current) return;
    if (searchParams?.get("openSummary") === "1") {
      autoOpenedRef.current = true;
      // Pre-apply gate auto-open: pre-fill from the CV when one exists (the
      // modal ignores this if there's no resume).
      setPrefillFromCv(true);
      setShowModal(true);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("openSummary");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  const [strength, setSummary] = useState("");
  const [interest, setInterest] = useState("");
  // Tracks whether the user generated a summary this session (before the
  // React Query cache has been refreshed). Prevents stale `raw` from wiping
  // the locally-generated content on re-renders (e.g. theme change).
  const localGenerationRef = useRef(false);

  // Hydrate from the React Query profile response — the API is the only
  // source of truth. We deliberately do not persist to localStorage.
  useEffect(() => {
    if (raw?.strengths_summary || raw?.interests_summary) {
      setSummary(raw.strengths_summary ?? "");
      setInterest(raw.interests_summary ?? "");
      localGenerationRef.current = false;
      return;
    }
    if (raw !== undefined && !localGenerationRef.current) {
      setSummary("");
      setInterest("");
    }
  }, [raw]);

  // One-time cleanup of any legacy localStorage value left over from older
  // builds. Safe to delete this effect after a release or two.
  useEffect(() => {
    try {
      localStorage.removeItem("yp_ai_profile");
    } catch {
      /* ignore */
    }
  }, []);

  // Generate/Regenerate entry: locked (within 30 days) → info-only lock modal;
  // otherwise the 30-day warning, which then routes to the CV popup (if a CV is
  // uploaded) or straight to the builder.
  const handleGenerateClick = () => {
    const state = computeCooldown();
    setCooldownInfo(state);
    if (state.isLocked) setShowLockModal(true);
    else setShowWarningModal(true);
  };

  // On summary save, stamp the generation time onto the backend profile via the
  // update-profile API, using the user's LOCAL timezone. This is always recorded
  // — including for the owner/dev account — so the profile carries an accurate
  // last-generated time. The 30-day lock is separately waived for the owner
  // account (see computeCooldown), so recording the time here never restricts
  // it. We also write the value into the profile cache immediately so an
  // in-session Regenerate is evaluated against it before the round-trip.
  const recordGenerationTime = useCallback(() => {
    const ai_generation_time = getLocalGenerationTimestamp();
    queryClient.setQueryData(USER_PROFILE_QUERY_KEY, (old: any) =>
      old ? { ...old, data: { ...old?.data, ai_generation_time } } : old,
    );
    updateProfileMutation
      .mutateAsync(buildProfilePreservePayload(raw, { ai_generation_time }))
      .catch((err) => {
        console.error(
          "[ai_generation_time] Failed to record generation time:",
          err,
        );
      });
  }, [raw, queryClient, updateProfileMutation]);

  const handleSummaryGenerated = (data: {
    strength: string;
    interest: string;
  }) => {
    localGenerationRef.current = true;
    setSummary(data.strength);
    setInterest(data.interest);
    // Write the new summary straight into the profile cache so the card shows
    // it immediately (no refetch) — and so the hydration effect, which re-runs
    // whenever the cache changes (e.g. recordGenerationTime below), doesn't
    // overwrite the fresh summary with the stale cached value.
    queryClient.setQueryData(USER_PROFILE_QUERY_KEY, (old: any) =>
      old
        ? {
            ...old,
            data: {
              ...old?.data,
              strengths_summary: data.strength,
              interests_summary: data.interest,
            },
          }
        : old,
    );
    recordGenerationTime();
    toast.success("Summary generated!");
  };

  const handleSummarySave = async (val: string) => {
    ensureAuthed("generate your AI summary", async () => {
      setSummary(val);
      try {
        await addAISummary({
          strengths_summary: val,
          interests_summary: interest,
          ai_modal: "llama-3.3-70b-versatile",
        });
      } catch (err) {
        if (isUnauthenticatedError(err)) {
          openGate("generate your AI summary");
          return;
        }
        console.error("[addAISummary] Failed to save strength:", err);
      }
      toast.success("Strength updated!");
    });
  };

  const hasContent = !!(strength || interest);
  // A blank/whitespace-only resume_url means no CV (e.g. after a removal), so
  // trim before treating it as an existing CV.
  const cvUrl = (raw?.resume_url ?? raw?.resume ?? "").toString().trim();
  const hasCv = !!cvUrl;

  const cv: CvData = {
    name: modalProfileData.name || userName,
    strength,
    interest,
  };

  return (
    <>
      <div className="mt-4">
        <div className="card_custom" style={{ minHeight: "unset" }}>
          <div className={styles.profileInfo}>
            {/* ── Header ── */}
            <div
              className={styles.nameWrapper}
              style={{ marginBottom: hasContent ? "16px" : "0" }}
            >
              <div
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                <h2 className={styles.section_title} style={{ margin: 0 }}>
                  Profile Summary
                </h2>
              </div>

              <CVActions
                cv={cv}
                hasContent={hasContent}
                onRegenerate={() =>
                  ensureAuthed("generate your AI summary", handleGenerateClick)
                }
                onEdit={() =>
                  ensureAuthed("generate your AI summary", () =>
                    setEditingSummary(true),
                  )
                }
                canEdit={hasContent && !editingSummary}
              />
            </div>

            {/* ── Content ── */}
            {hasContent ? (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                }}
              >
                <InlineField
                  label="Strength"
                  accentColor="#3b82f6"
                  accentBorder="rgba(59,130,246,0.25)"
                  accentBg="rgba(59,130,246,0.04)"
                  value={strength}
                  onSave={handleSummarySave}
                  editing={editingSummary}
                  onEditingChange={setEditingSummary}
                />
              </div>
            ) : (
              <EmptyState
                onGenerate={() =>
                  ensureAuthed("generate your AI summary", handleGenerateClick)
                }
              />
            )}
          </div>
        </div>
      </div>

      <SummaryGeneratorModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSummaryGenerated={handleSummaryGenerated}
        userName={userName}
        profileData={modalProfileData}
        hasExistingSummary={hasContent}
        resumeUrl={cvUrl}
        prefillFromCv={prefillFromCv}
      />

      {/* CV present → let the user choose how to answer. "Use My CV" pre-fills
          each answer from the resume (still editable); "Fill Manually" runs the
          plain question flow. */}
      <ConfirmModal
        isOpen={showCvChoiceModal}
        icon={<FileText />}
        iconVariant="info"
        onClose={() => setShowCvChoiceModal(false)}
        onConfirm={() => {
          setShowCvChoiceModal(false);
          setPrefillFromCv(true);
          setShowModal(true);
        }}
        onCancel={() => {
          setShowCvChoiceModal(false);
          setPrefillFromCv(false);
          setShowModal(true);
        }}
        title="CV Detected"
        message="Let Dan AI extract your information and pre-fill your profile. You can edit everything before submitting"
        confirmText="Auto-fill from my CV"
        cancelText="I'll answer manually"
      />

      <ConfirmModal
        isOpen={showWarningModal}
        icon={<Sparkles />}
        iconVariant="primary"
        onClose={() => setShowWarningModal(false)}
        onConfirm={() => {
          setShowWarningModal(false);
          if (hasCv) {
            setShowCvChoiceModal(true);
          } else {
            setPrefillFromCv(false);
            setShowModal(true);
          }
        }}
        title="Generate once every 30 days"
        message={
          cooldownInfo
            ? `Your AI summary can be generated once every 30 days. If you generate it today, you'll be able to regenerate again on ${cooldownInfo.projectedUnlockDate}.`
            : ""
        }
        confirmText="Continue"
        cancelText="Cancel"
      />

      <ConfirmModal
        isOpen={showLockModal}
        icon={<Clock />}
        iconVariant="info"
        onClose={() => setShowLockModal(false)}
        onConfirm={() => setShowLockModal(false)}
        hideActions
        title="Profile Summary Generation Limit Reached"
        message={
          cooldownInfo
            ? `You can generate your next Profile Summary in ${cooldownInfo.daysRemaining} ${cooldownInfo.daysRemaining === 1 ? "day" : "days"}.`
            : ""
        }
      />

      {authGateModal}
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
    const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  return (
    <div
      style={{
        marginTop: "12px",
        background: "rgba(255,255,255,0.02)",
        border: "1px dashed rgba(99,179,255,0.15)",
        borderRadius: "14px",
        padding: "24px 20px",
        textAlign: "center",
      }}
    >
      <p
        style={{
          fontSize: "13px",
          fontWeight: 600,
          color: `${isLight ? "#A0AEC0" : "#fff" }`,
          marginBottom: "6px",
        }}
      >
        Build Your Profile Summary with Dan AI
      </p>
      <p
        style={{
          fontSize: "12px",
          color: "#A0AEC0",
          lineHeight: "1.5",
          marginBottom: "16px",
        }}
      >
        Answer 10 quick questions and let Dan AI craft your
        <br />
        professional profile summary.
      </p>
      <button
        onClick={onGenerate}
        className="btn-gradient"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12.5px",
          padding: "8px 20px",
          borderRadius: "20px",
          cursor: "pointer",
          fontWeight: 600,
        }}
      >
        {/* <Sparkles size={13} /> */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20px"
          height="20px"
          viewBox="0 0 24 24"
        >
          <path
            fill="currentColor"
            d="m21.45 11.11l-3-1.5l-2.7-1.35l-1.35-2.7l-1.5-3c-.34-.68-1.45-.68-1.79 0l-1.5 3l-1.35 2.7l-2.7 1.35l-3 1.5c-.34.17-.55.52-.55.89s.21.72.55.89l3 1.5l2.7 1.35l1.35 2.7l1.5 3c.17.34.52.55.89.55s.73-.21.89-.55l1.5-3l1.35-2.7l2.7-1.35l3-1.5c.34-.17.55-.52.55-.89s-.21-.72-.55-.89Zm-3.89 1.5l-.84.42l-2.16 1.08l-.3.15l-.15.3L12 18.77l-2.11-4.21l-.15-.3l-.3-.15l-2.16-1.08l-.84-.42L5.23 12l1.21-.61l.84-.42l2.16-1.08l.3-.15l.15-.3L12 5.23l2.11 4.21l.15.3l.3.15l2.16 1.08l.84.42l1.21.61zM19.5 1.5l-.94 2.06l-2.06.94l2.06.94l.94 2.06l.94-2.06l2.06-.94l-2.06-.94z"
          ></path>
        </svg>
        Get Started
      </button>
    </div>
  );
}

// ─── Inline Field ─────────────────────────────────────────────────────────────

function InlineField({
  label,
  accentColor,
  accentBg,
  accentBorder,
  value,
  onSave,
  editing,
  onEditingChange,
}: {
  label: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  value: string;
  onSave: (val: string) => void;
  editing: boolean;
  onEditingChange: (v: boolean) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === "light";
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  // What the draft looked like when edit mode opened — the baseline Cancel
  // compares against to decide whether anything would actually be lost.
  const baselineRef = useRef("");

  // Entering edit mode (triggered from the header row) seeds the draft from the
  // current value and focuses the textarea.
  useEffect(() => {
    if (editing) {
      const initial = stripMarkdown(value);
      baselineRef.current = initial;
      setDraft(initial);
      setShowUnsavedConfirm(false);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const save = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onSave(trimmed);
    }
    onEditingChange(false);
  };

  const cancel = () => {
    if (draft.trim() !== baselineRef.current.trim()) {
      setShowUnsavedConfirm(true);
      return;
    }
    onEditingChange(false);
  };

  const discardEdits = () => {
    setShowUnsavedConfirm(false);
    onEditingChange(false);
  };

  // Pull the leading "# ..." title out so it sits at the top of the box (the
  // Edit control now lives up in the card header row next to Regenerate).
  const contentLines = value.split("\n");
  const headingIdx = contentLines.findIndex((l) => l.trim().startsWith("# "));
  const headingText =
    headingIdx >= 0
      ? contentLines[headingIdx]
          .trim()
          .slice(2)
          .trim()
          .replace(/\s*summary\s*$/i, "")
      : "";
  const bodyValue =
    headingIdx >= 0
      ? contentLines.filter((_, idx) => idx !== headingIdx).join("\n")
      : value;

  return (
    <div
      style={{
        background: accentBg,
        border: `1px solid ${editing ? accentColor : accentBorder}`,
        borderRadius: "14px",
        padding: "14px 16px",
        transition: "border-color 0.2s",
      }}
    >
      {/* ── Title (Edit moved up to the header row next to Regenerate) ── */}
      {headingText && (
        <div style={{ marginBottom: "12px" }}>
          <span
            style={{
              fontSize: "15px",
              fontWeight: 700,
              color: isLight ? "#1e293b" : "#fff",
            }}
          >
            {headingText}
          </span>
        </div>
      )}

      {/* ── Body ── */}
      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={6}
            style={{
              width: "100%",
              background: isLight ? "transparent" : "rgba(0,0,0,0.2)",
              border: `1px solid ${accentColor}`,
              borderRadius: "10px",
              padding: "10px 12px",
              color: isLight ? "#333" : "#e2e8f0",
              fontSize: "13px",
              lineHeight: "1.7",
              fontFamily: "inherit",
              resize: "vertical",
              outline: "none",
              boxSizing: "border-box",
              transition: "border-color 0.2s",
              height: "330px"
            }}
          />

          {/* Char count + actions */}
          <div className={styles_ai.actionsWrapper}>
            <div className={styles_ai.actions}>
              <button
                onClick={cancel}
                className={
                  isLight ? styles_ai.cancelBtnLight : styles_ai.cancelBtn
                }
              >
                <X size={11} /> Cancel
              </button>

              <button
                onClick={save}
                disabled={!draft.trim()}
                className={
                  isLight
                    ? styles_ai.saveBtnLight
                    : `${styles_ai.saveBtn} ${
                        label === "Strength"
                          ? styles_ai.saveBtnStrength
                          : styles_ai.saveBtnDefault
                      }`
                }
              >
                <Check size={11} /> Save
              </button>
            </div>
          </div>

          <UnsavedChangesModal
            isOpen={showUnsavedConfirm}
            onDiscard={discardEdits}
            onKeepEditing={() => setShowUnsavedConfirm(false)}
          />
        </>
      ) : (
        renderMarkdown(bodyValue, accentColor, isLight)
      )}
    </div>
  );
}
