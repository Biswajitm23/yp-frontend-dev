// components/profile/EducationCard.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "../../moduleCss/profile.module.css";
import Image from "next/image";
import {
  CustomModalForm,
  SelectOption,
  type FormField,
} from "../modals/CustomModalForm";
import { toast } from "react-toastify";
import { updateUserProfile } from "@/services/profile.services";
import courseData from "@/data/courses.json";
import DummyUniversity from "../../../public/images/DummyUniversity.png";
import { fetchInstitutions } from "@/services/options.services";
import { EDUCATION_MIN_YEAR } from "@/lib/profileDateBounds";
import { useQuery } from "@tanstack/react-query";
import {
  CAREER_STATUS_OPTIONS,
  isContextualStatus,
  isEducationStatus,
  getAllowedCourseIds,
  getCareerStatusId,
  courseOptionsDiffer,
} from "@/helpers/careerStatus";
import { useTheme, themePreferenceToApi } from "@/context/ThemeContext";
import { useAuthGate } from "@/app/hooks/useAuthGate";
import { isUnauthenticatedError } from "@/lib/authError";
import { type Education } from "@/app/hooks/useUserProfile";
import ConfirmModal from "../commonUI/ConfirmModal";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import {
  buildEducationEntries,
  educationCourseLabel,
  getJourneyEntryKey,
  EducationJourney,
  StatusIcon,
  type EducationEntryRow,
} from "./educationEntries";

type Props = {
  university?: string;
  degree?: string;
  duration?: string; // format: "YYYY - YYYY"
  dob?: string;
  careerStatus?: string;
  currentSituation?: string;
  // New multi-education list. Falls back to the single flat fields above when
  // the backend hasn't switched to `educations[]` yet (transition-safe).
  educations?: Education[];
  onEducationUpdated?: (updatedEdu: any) => void;
};

// Row shape + the `educations[]` → row mapping now live in ./educationEntries
// so the read-only card on another user's profile maps identically.
type EntryRow = EducationEntryRow;

const BLANK_VALUES = {
  university: "",
  degree: "",
  customCourseName: "",
  startYear: "",
  endYear: "",
  careerStatus: "",
  currentSituation: "",
};

// Flip to false to revert the education entry to the previous stacked layout
// (the old markup is kept, just guarded by this flag).
const USE_NEW_EDU_LAYOUT: boolean = true;

export default function EducationCard({
  university,
  degree,
  duration,
  dob,
  careerStatus,
  currentSituation,
  educations,
  onEducationUpdated,
}: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { preference } = useTheme();
  const { ensureAuthed, openGate, gateModal: authGateModal } = useAuthGate();

  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [modalMode, setModalMode] = useState<null | "add" | "edit">(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [formValues, setFormValues] = useState({ ...BLANK_VALUES });
  const [deleteKey, setDeleteKey] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Accordion: only ONE entry is open at a time. Default = first entry, which
  // also covers the "single entry is always open" case.
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Extract birth year from dob (handles both DD-MM-YYYY and YYYY-MM-DD)
  const getBirthYear = (): number | null => {
    if (!dob) return null;
    const parts = dob.split("-");
    if (parts.length !== 3) return null;
    if (parts[0].length === 2) return parseInt(parts[2]); // DD-MM-YYYY
    if (parts[0].length === 4) return parseInt(parts[0]); // YYYY-MM-DD
    return null;
  };

  const currentYear = new Date().getFullYear();
  const startYearOptions = useMemo(
    () =>
      Array.from({ length: currentYear - EDUCATION_MIN_YEAR + 1 }, (_, i) => {
        const y = currentYear - i;
        return { value: String(y), label: String(y) };
      }),
    [currentYear],
  );

  // Each status can belong to only ONE entry. Hide statuses used by OTHER
  // entries; when editing, the entry's own status is always kept selectable.
  // Additionally, "Taking a gap year" and "Finished education..." are mutually
  // exclusive — a user can pick at most ONE of the two across all entries — so
  // once another entry uses a contextual status, BOTH contextual options are
  // hidden from the remaining entries.
  const careerStatusOptions = useMemo(() => {
    const others = entries.filter((e) =>
      modalMode === "edit" ? e.key !== editingKey : true,
    );
    const usedByOthers = new Set(
      others.map((e) => e.careerStatus).filter(Boolean),
    );
    const contextualUsedByOthers = others.some((e) =>
      isContextualStatus(e.careerStatus),
    );
    return CAREER_STATUS_OPTIONS.filter((opt) => {
      // Always keep the entry's own current value selectable.
      if (opt.name === formValues.careerStatus) return true;
      if (usedByOthers.has(opt.name)) return false;
      // Hide the other contextual option once one is already taken.
      if (contextualUsedByOthers && isContextualStatus(opt.name)) return false;
      return true;
    }).map((opt) => ({ label: opt.name, value: opt.name }));
  }, [entries, modalMode, editingKey, formValues.careerStatus]);

  // A user can add up to 3 education entries (school + university + one of the
  // two mutually-exclusive contextual statuses). At the cap the Add button is
  // disabled silently — no popup / message.
  const MAX_EDUCATIONS = 3;
  const addDisabled = entries.length >= MAX_EDUCATIONS;

  // The profile carries a SINGLE shared "My Journey" (current_situation), which
  // the entry mapping copies onto every contextual entry. Show it exactly once —
  // on the most-recently-added (last) contextual entry — so adding a new journey
  // replaces the old one on screen instead of duplicating it. Always the latest.
  const journeyEntryKey = useMemo(() => getJourneyEntryKey(entries), [entries]);

  const filteredCourseOptions = useMemo(() => {
    const allowed = getAllowedCourseIds(formValues.careerStatus);
    const list = allowed
      ? courseData.courses.filter((c: any) => allowed.has(c.id))
      : courseData.courses;
    return list.map((course) => ({ label: course.name, value: course.name }));
  }, [formValues.careerStatus]);

  const { data: institutionsData } = useQuery({
    queryKey: ["institutions"],
    queryFn: fetchInstitutions,
    staleTime: 1000 * 60 * 10,
  });

  const institutionOptions = useMemo(
    () =>
      institutionsData?.data?.institutions?.map((inst: any) => ({
        id: inst.id,
        name: inst.name,
      })) || [],
    [institutionsData],
  );

  // Build entry rows via the shared mapper (see ./educationEntries) so the
  // read-only card on another user's profile derives rows identically.
  const buildEntries = (): EntryRow[] =>
    buildEducationEntries({
      educations,
      university,
      degree,
      duration,
      careerStatus,
      currentSituation,
    });

  // Sync props → entry rows.
  useEffect(() => {
    setEntries(buildEntries());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [educations, university, degree, duration, careerStatus, currentSituation]);

  // Keep the accordion state in sync with the entries: if the open entry was
  // removed (or nothing is open yet), fall back to the first entry so the card
  // is never fully collapsed (single entry ⇒ always open; multiple ⇒ first
  // open, rest collapsed).
  useEffect(() => {
    setOpenKey((prev) => {
      if (prev && entries.some((e) => e.key === prev)) return prev;
      return entries.length > 0 ? entries[0].key : null;
    });
  }, [entries]);

  // Single-open accordion: clicking the open entry collapses it; clicking a
  // different entry opens it and implicitly closes the previously open one.
  const toggleOpen = (key: string) => {
    setOpenKey((prev) => (prev === key ? null : key));
  };

  const openAddModal = () => {
    setEditingKey(null);
    setFormValues({ ...BLANK_VALUES });
    setModalMode("add");
  };

  const openEditModal = (row: EntryRow) => {
    setEditingKey(row.key);
    setFormValues({
      university: row.university,
      degree: row.degree,
      customCourseName: row.customCourseName,
      startYear: row.startYear,
      endYear: row.endYear,
      careerStatus: row.careerStatus,
      currentSituation: row.currentSituation,
    });
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingKey(null);
  };

  const courseLabel = educationCourseLabel;

  // The primary (first) entry represents the user's "Current Status"; every
  // other case — adding a new entry, or editing a non-primary one — is an
  // "Education Level".
  const isCurrentStatusField =
    modalMode === "edit" &&
    entries.findIndex((e) => e.key === editingKey) === 0;

  // Same modal field set + branch logic as onboarding / the original edit modal.
  const modalFields: FormField[] = [
    {
      id: "careerStatus",
      name: "careerStatus",
      label: isCurrentStatusField ? "Current Status" : "Education Level",
      type: "autoComplete",
      required: true,
      placeholder: isCurrentStatusField
        ? "Select your current status"
        : "Select your Education Level",
      value: formValues.careerStatus,
      options: careerStatusOptions,
      searchPlaceholder: "Search status...",
      allowUserTyping: false,
      // When the user switches branches (Education ↔ Contextual), clear the
      // dependent fields so stale values don't bleed into the new branch's
      // payload. Returning an override object merges into the new formData.
      onChange: (value: any, _next: any, prev: any) => {
        const prevValue = prev?.careerStatus ?? "";
        const prevBranch = isEducationStatus(prevValue)
          ? "A"
          : isContextualStatus(prevValue)
            ? "B"
            : null;
        const nextBranch = isEducationStatus(value)
          ? "A"
          : isContextualStatus(value)
            ? "B"
            : null;
        const branchSwitched =
          prevBranch && nextBranch && prevBranch !== nextBranch;

        // Within a branch the course list can still change — school/college and
        // university each have their own. A course picked under the old status
        // may not exist in the new dropdown, so clear it (and the "Other" course
        // name that hangs off it). Gap year and finished education share one
        // list, so switching between those keeps the selection.
        const courseListChanged = courseOptionsDiffer(prevValue, value);

        const reset = branchSwitched
          ? {
              university: "",
              degree: "",
              customCourseName: "",
              startYear: "",
              endYear: "",
              currentSituation: "",
            }
          : courseListChanged
            ? { degree: "", customCourseName: "" }
            : null;

        queueMicrotask(() => {
          setFormValues((p) => ({
            ...p,
            careerStatus: value,
            ...(reset ?? {}),
          }));
        });

        return reset ?? undefined;
      },
    },
    {
      id: "university",
      name: "university",
      label: isContextualStatus(formValues.careerStatus)
        ? "Which institution did you attend?"
        : "Place of study",
      type: "autoComplete",
      required: true,
      placeholder: isContextualStatus(formValues.careerStatus)
        ? "Which institution did you attend?*"
        : "Place of study",
      value: formValues.university,
      options: institutionOptions,
      searchPlaceholder: "Search universities...",
      allowUserTyping: false,
    },
    {
      id: "degree",
      name: "degree",
      label: isContextualStatus(formValues.careerStatus)
        ? "Highest qualification"
        : "Education",
      placeholder: isContextualStatus(formValues.careerStatus)
        ? "Highest qualification*"
        : "Education",
      type: "autoComplete",
      searchPlaceholder: "Search education...",
      required: true,
      value: formValues.degree,
      allowUserTyping: false,
      options: filteredCourseOptions,
    },
    {
      id: "customCourseName",
      name: "customCourseName",
      label: "Course Name",
      type: "text",
      placeholder: "Specify your education*",
      required: true,
      value: formValues.customCourseName,
      showIf: (data) => data.degree === "Other",
    },
    {
      id: "startYear",
      name: "startYear",
      label: "Start Year",
      type: "autocomplete_without_search",
      className: "md:col-span-1",
      required: true,
      value: formValues.startYear,
      placeholder: "Start Year*",
      options: (formData) => {
        const status = formData.careerStatus || "";
        const isBranchB = isContextualStatus(status);
        const min = isBranchB
          ? getBirthYear() ?? EDUCATION_MIN_YEAR
          : EDUCATION_MIN_YEAR;
        const count = currentYear - min + 1;
        if (count <= 0) return [];
        return Array.from({ length: count }, (_, i) => {
          const y = currentYear - i;
          return { label: String(y), value: String(y) };
        });
      },
    },
    {
      id: "endYear",
      name: "endYear",
      label: "End Year",
      type: "autocomplete_without_search",
      className: "md:col-span-1",
      required: true,
      value: formValues.endYear,
      placeholder: "End Year*",
      options: (formData) => {
        const status = formData.careerStatus || "";
        const isBranchB = isContextualStatus(status);
        const startYear = Number(formData.startYear);

        if (isBranchB) {
          const max = currentYear + 9;
          const startBase = startYear || (getBirthYear() ?? EDUCATION_MIN_YEAR);
          const min = startBase + 1;
          if (max < min) return [];
          return Array.from({ length: max - min + 1 }, (_, i) => {
            const y = max - i;
            return { label: String(y), value: String(y) };
          });
        }

        if (!startYear) return startYearOptions;
        const endLimit = startYear + 9;
        const options: SelectOption[] = [];
        for (let y = startYear + 1; y <= endLimit; y++) {
          options.push({ label: String(y), value: String(y) });
        }
        return options;
      },
    },
    {
      id: "currentSituation",
      name: "currentSituation",
      label: "Current Situation",
      type: "textarea",
      placeholder: "Please tell us about your current situation*",
      required: true,
      value: formValues.currentSituation,
      minLength: 10,
      maxLength: 500,
      rows: 4,
      inputClassName:
        "!max-h-32 overflow-y-auto resize-none field-sizing-fixed break-words",
      showIf: (data) => isContextualStatus(data.careerStatus || ""),
    },
  ];

  const handleSubmit = async (data: Record<string, any>) => {
    ensureAuthed("update your profile", async () => {
      if (!data.careerStatus || !String(data.careerStatus).trim()) {
        toast.error(
          isCurrentStatusField
            ? "Please select your current status"
            : "Please select your Education Level",
        );
        return;
      }

      const branchA = isEducationStatus(data.careerStatus);
      const branchB = isContextualStatus(data.careerStatus);

      if (branchA) {
        const requiredFields = ["university", "degree", "startYear", "endYear"];
        for (const f of requiredFields) {
          if (!data[f] || String(data[f]).trim() === "") {
            const label = f
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (s) => s.toUpperCase());
            toast.error(`${label} is required`);
            return;
          }
        }
      } else if (branchB) {
        if (!data.university || String(data.university).trim() === "") {
          toast.error("Please select the institution you attended");
          return;
        }
        if (!data.degree || String(data.degree).trim() === "") {
          toast.error("Please select your highest qualification");
          return;
        }
        if (!data.startYear || String(data.startYear).trim() === "") {
          toast.error("Start year is required");
          return;
        }
        if (!data.endYear || String(data.endYear).trim() === "") {
          toast.error("End year is required");
          return;
        }
        const sit = String(data.currentSituation || "").trim();
        if (!sit) {
          toast.error("Please describe your current situation");
          return;
        }
        if (sit.length < 10) {
          toast.error("Current situation must be at least 10 characters");
          return;
        }
        if (sit.length > 500) {
          toast.error("Current situation must be 500 characters or fewer");
          return;
        }
      }

      const isValidDegree = courseData.courses.some(
        (course) => course.name.toLowerCase() === data.degree.toLowerCase(),
      );
      if (!isValidDegree) {
        toast.error("Please select a valid degree from the list");
        return;
      }

      if (
        data.degree === "Other" &&
        (!data.customCourseName || String(data.customCourseName).trim() === "")
      ) {
        toast.error("Please enter your course name");
        return;
      }

      const birthYear = getBirthYear();
      if (data.startYear && data.endYear) {
        if (birthYear) {
          if (parseInt(data.startYear) < birthYear) {
            toast.error(
              `Start year cannot be before your birth year (${birthYear})`,
            );
            return;
          }
          if (parseInt(data.endYear) < birthYear) {
            toast.error(
              `End year cannot be before your birth year (${birthYear})`,
            );
            return;
          }
        }
        if (parseInt(data.endYear) < parseInt(data.startYear)) {
          toast.error("End year cannot be earlier than start year!");
          return;
        }
      }

      const row: EntryRow = {
        key: editingKey ?? `local-${Date.now()}`,
        id: editingKey
          ? entries.find((e) => e.key === editingKey)?.id
          : undefined,
        careerStatus: data.careerStatus,
        university: data.university || "",
        degree: data.degree,
        customCourseName:
          data.degree === "Other" ? String(data.customCourseName).trim() : "",
        startYear: data.startYear || "",
        endYear: data.endYear || "",
        currentSituation: branchB ? String(data.currentSituation).trim() : "",
      };

      const newEntries =
        modalMode === "add"
          ? [...entries, row]
          : entries.map((e) => (e.key === editingKey ? row : e));

      // New backend: full educations list (replace-all).
      const educationsPayload = newEntries.map((e) => {
        const edu =
          e.degree === "Other" && e.customCourseName.trim()
            ? e.customCourseName.trim()
            : e.degree;
        return {
          ...(e.id ? { id: e.id } : {}),
          education_status: getCareerStatusId(e.careerStatus) || "0",
          degree: edu,
          place_of_study: e.university,
          education: edu,
          start_year: e.startYear,
          end_year: e.endYear,
          // current_situation now travels on each education item (contextual
          // statuses only; null otherwise).
          current_situation: isContextualStatus(e.careerStatus)
            ? e.currentSituation.trim() || null
            : null,
        };
      });

      // One shared "My Journey" (top-level). Prefer the entry the user just
      // added/edited when it's contextual, so the LATEST journey wins; else
      // fall back to any contextual entry.
      const topCurrentSituation = isContextualStatus(row.careerStatus)
        ? row.currentSituation
        : newEntries.find((e) => isContextualStatus(e.careerStatus))
            ?.currentSituation ?? "";

      const payload: Record<string, any> = {
        theme_setting: themePreferenceToApi(preference),
        current_situation: topCurrentSituation,
        educations: educationsPayload,
        // update-profile is full-replace: without re-sending the existing DOB
        // it gets reset. Only ProfileInfoCard (where the user can clear it)
        // removes the value; here we always preserve whatever is on file.
        ...(dob ? { dob } : {}),
      };

      // Old backend (still on flat fields): keep the primary entry saving as
      // before so nothing is wiped during the transition. Ignored by the new
      // backend, which reads `educations` instead.
      const primary = newEntries[0];
      if (primary) {
        const primaryEdu =
          primary.degree === "Other" && primary.customCourseName.trim()
            ? primary.customCourseName.trim()
            : primary.degree;
        payload.career_status = getCareerStatusId(primary.careerStatus);
        payload.place_of_study = primary.university;
        payload.education = primaryEdu;
        payload.start_year = primary.startYear;
        payload.end_year = primary.endYear;
      }

      setIsSubmitting(true);
      try {
        await updateUserProfile(payload);

        setEntries(newEntries);
        onEducationUpdated?.({
          educations: educationsPayload,
          current_situation: topCurrentSituation,
        });

        toast.success(
          modalMode === "add"
            ? "Education added successfully!"
            : "Education updated successfully!",
        );
        closeModal();
      } catch (err: any) {
        if (isUnauthenticatedError(err)) openGate("update your profile");
        else
          toast.error(err?.message || "Failed to update education details!");
      } finally {
        setIsSubmitting(false);
      }
    });
  };

  const handleDelete = () => {
    ensureAuthed("update your profile", async () => {
      if (!deleteKey) return;
      const newEntries = entries.filter((e) => e.key !== deleteKey);

      const educationsPayload = newEntries.map((e) => {
        const edu =
          e.degree === "Other" && e.customCourseName.trim()
            ? e.customCourseName.trim()
            : e.degree;
        return {
          ...(e.id ? { id: e.id } : {}),
          education_status: getCareerStatusId(e.careerStatus) || "0",
          degree: edu,
          place_of_study: e.university,
          education: edu,
          start_year: e.startYear,
          end_year: e.endYear,
          // current_situation now travels on each education item (contextual
          // statuses only; null otherwise).
          current_situation: isContextualStatus(e.careerStatus)
            ? e.currentSituation.trim() || null
            : null,
        };
      });

      const branchBEntry = newEntries.find((e) =>
        isContextualStatus(e.careerStatus),
      );
      const topCurrentSituation = branchBEntry
        ? branchBEntry.currentSituation
        : "";

      const payload: Record<string, any> = {
        theme_setting: themePreferenceToApi(preference),
        current_situation: topCurrentSituation,
        educations: educationsPayload,
        // update-profile is full-replace: without re-sending the existing DOB
        // it gets reset. Only ProfileInfoCard (where the user can clear it)
        // removes the value; here we always preserve whatever is on file.
        ...(dob ? { dob } : {}),
      };

      const primary = newEntries[0];
      if (primary) {
        const primaryEdu =
          primary.degree === "Other" && primary.customCourseName.trim()
            ? primary.customCourseName.trim()
            : primary.degree;
        payload.career_status = getCareerStatusId(primary.careerStatus);
        payload.place_of_study = primary.university;
        payload.education = primaryEdu;
        payload.start_year = primary.startYear;
        payload.end_year = primary.endYear;
      }

      setDeleteLoading(true);
      try {
        await updateUserProfile(payload);
        setEntries(newEntries);
        onEducationUpdated?.({
          educations: educationsPayload,
          current_situation: topCurrentSituation,
        });
        toast.success("Education deleted successfully!");
        setDeleteKey(null);
      } catch (err: any) {
        if (isUnauthenticatedError(err)) openGate("update your profile");
        else toast.error(err?.message || "Failed to delete education!");
      } finally {
        setDeleteLoading(false);
      }
    });
  };

  return (
    <div className={styles.educationCard}>
      {authGateModal}
      <div className="card_custom">
        <div className={styles.profileInfo}>
          <div className={`${styles.nameWrapper}`}>
            <h2 className={styles.section_title}>Education</h2>

            <button
              type="button"
              aria-label="Add education"
              className={styles.editBtn}
              onClick={openAddModal}
              disabled={addDisabled}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                ...(addDisabled
                  ? { opacity: 0.5, cursor: "not-allowed" }
                  : {}),
              }}
            >
              <Plus size={16} />
              Add
            </button>
          </div>

          {/* Entry list — scrolls inside (Top Skills-style) so the card height
              stays fixed and the neighbouring card is unaffected. */}
          <div
            className={styles.educationList}
            style={{ height: "auto", maxHeight: 200, overflowY: "auto" }}
          >
            {entries.length === 0 ? (
              <p className={styles.profile_info} style={{ opacity: 0.7 }}>
                No education added yet.
              </p>
            ) : (
              entries.map((row, idx) => {
                const hasEduDetails = !!(
                  row.university ||
                  row.degree ||
                  (row.startYear && row.endYear)
                );

                // ── OLD stacked layout — preserved; rendered only when the flag
                //    USE_NEW_EDU_LAYOUT is false (flip it to revert). ──
                if (!USE_NEW_EDU_LAYOUT) {
                return (
                  <div
                    key={row.key}
                    className="group"
                    style={{
                      position: "relative",
                      display: "flex",
                      flexDirection: "column",
                      border: "1px solid rgba(160,174,192,0.2)",
                      borderRadius: 12,
                      padding: "12px 12px",
                      marginBottom: 10,
                    }}
                  >
                    {/* Controls — top-right corner (edit always, delete on hover) */}
                    <div
                      style={{
                        position: "absolute",
                        top: 10,
                        right: 10,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        zIndex: 10,
                      }}
                    >
                      <button
                        type="button"
                        aria-label="Edit education"
                        className={styles.editBtn}
                        onClick={() => openEditModal(row)}
                        style={{ padding: 0 }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          viewBox="0 0 27 27"
                          fill="none"
                        >
                          <path
                            d="M7.875 19.125V14.625L19.125 3.375L23.625 7.875L12.375 19.125H7.875Z"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3.375 23.625H23.625"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15.75 6.75L20.25 11.25"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => setDeleteKey(row.key)}
                        aria-label="Delete education"
                        className="opacity-0 transition-opacity group-hover:opacity-100"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          cursor: "pointer",
                        }}
                      >
                        <Trash2 size={16} color="#ef4444" />
                      </button>
                    </div>

                    {/* 1. Institution + course + duration */}
                    {hasEduDetails && (
                      <div
                        className={styles.education_wrapper}
                        style={{ order: 1, paddingRight: 44 }}
                      >
                        <div className={styles.university_Image_area}>
                          <Image
                            src={DummyUniversity}
                            alt="University"
                            width={30}
                            height={30}
                          />
                        </div>
                        <div className={styles.educationItem_inner}>
                          {row.university && (
                            <div className={styles.educationItem}>
                              <p className={styles.university_name}>
                                {row.university}
                              </p>
                            </div>
                          )}
                          {row.degree && (
                            <div className={styles.educationItem}>
                              <p className={styles.degree}>{courseLabel(row)}</p>
                            </div>
                          )}
                          {row.startYear && row.endYear && (
                            <div className={styles.educationItem}>
                              <p className={styles.duration}>
                                {`${row.startYear} - ${row.endYear}`}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 2. Divider */}
                    {hasEduDetails && (
                      <div
                        style={{
                          order: 2,
                          height: 1,
                          background: "rgba(160,174,192,0.2)",
                          margin: "12px 0",
                        }}
                      />
                    )}

                    {/* 3. Status header + value */}
                    <p
                      className={styles.location_text}
                      style={{
                        order: 3,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        margin: 0,
                        fontSize: "12.7px",
                      }}
                    >
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
                      {idx === 0 ? "Current Status" : "Education Level"}
                    </p>

                    <p
                      className={styles.profile_info}
                      style={{
                        order: 4,
                        marginTop: 4,
                        marginBottom: 0,
                        fontSize: "12.7px",
                      }}
                    >
                      {row.careerStatus || "—"}
                    </p>
                  </div>
                );
                }

                // ── NEW accordion layout: collapsible entry ──
                //   • single entry  → always open (chevron hidden)
                //   • multiple      → first open, the rest collapsed
                const isSingle = entries.length === 1;
                const isOpen = isSingle || openKey === row.key;
                const headerLabel =
                  idx === 0 ? "Current Status" : "Education Level";

                return (
                  <div
                    key={row.key}
                    className="group"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      border: "1px solid rgba(160,174,192,0.2)",
                      borderRadius: 12,
                      overflow: "hidden",
                      marginBottom: 10,
                    }}
                  >
                    {/* Header — the whole label toggles the entry; the chevron
                        mirrors the open state and the edit icon sits at the end. */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 12px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={
                          isSingle ? undefined : () => toggleOpen(row.key)
                        }
                        aria-expanded={isOpen}
                        style={{
                          flex: "1 1 auto",
                          minWidth: 0,
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          textAlign: "left",
                          cursor: isSingle ? "default" : "pointer",
                        }}
                      >
                        <span style={{ flexShrink: 0, display: "flex" }}>
                          <StatusIcon />
                        </span>
                        <span
                          className={styles.university_name}
                          style={{
                            minWidth: 0,
                            fontSize: "14px",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: 0,
                          }}
                        >
                          {headerLabel}
                          {row.careerStatus ? ` · ${row.careerStatus}` : ""}
                        </span>
                      </button>

                      {!isSingle && (
                        <button
                          type="button"
                          onClick={() => toggleOpen(row.key)}
                          aria-label={isOpen ? "Collapse" : "Expand"}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <ChevronDown
                            size={20}
                            style={{
                              transition: "transform 0.2s ease",
                              transform: isOpen
                                ? "rotate(180deg)"
                                : "rotate(0deg)",
                            }}
                          />
                        </button>
                      )}

                      <button
                        type="button"
                        aria-label="Edit education"
                        className={styles.editBtn}
                        onClick={() => openEditModal(row)}
                        style={{ padding: 0, flexShrink: 0, display: "flex" }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={16}
                          height={16}
                          viewBox="0 0 27 27"
                          fill="none"
                        >
                          <path
                            d="M7.875 19.125V14.625L19.125 3.375L23.625 7.875L12.375 19.125H7.875Z"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M3.375 23.625H23.625"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M15.75 6.75L20.25 11.25"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>

                      {entries.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setDeleteKey(row.key)}
                          aria-label="Delete education"
                          style={{
                            display: "flex",
                            alignItems: "center",
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            flexShrink: 0,
                          }}
                        >
                          <Trash2 size={16} color="#ef4444" />
                        </button>
                      )}
                    </div>

                    {/* Body — institution details / journey. Always mounted and
                        animated open/close via grid-rows (0fr → 1fr) so the
                        height transition runs smoothly in both directions. */}
                    <div
                      style={{
                        display: "grid",
                        gridTemplateRows: isOpen ? "1fr" : "0fr",
                        transition: "grid-template-rows 0.28s ease",
                      }}
                    >
                      <div style={{ overflow: "hidden", minHeight: 0 }}>
                        <div
                          style={{
                            borderTop: "1px solid rgba(160,174,192,0.2)",
                            padding: "14px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                          }}
                        >
                          {hasEduDetails && (
                          <div
                            className={styles.education_wrapper}
                            style={{ alignItems: "center" }}
                          >
                            <div
                              className={styles.university_Image_area}
                              style={{ width: 64, height: 64, flexShrink: 0 }}
                            >
                              <Image
                                src={DummyUniversity}
                                alt="University"
                                width={44}
                                height={44}
                              />
                            </div>
                            <div className={styles.educationItem_inner}>
                              {row.university && (
                                <div className={styles.educationItem}>
                                  <p
                                    className={styles.university_name}
                                    style={{
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                    }}
                                  >
                                    {row.university}
                                  </p>
                                </div>
                              )}
                              {row.degree && (
                                <div className={styles.educationItem}>
                                  <p className={styles.degree}>
                                    {courseLabel(row)}
                                  </p>
                                </div>
                              )}
                              {row.startYear && row.endYear && (
                                <div className={styles.educationItem}>
                                  <p className={styles.duration}>
                                    {`${row.startYear} - ${row.endYear}`}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                          {/* My Journey — single shared value, rendered only on
                              the latest contextual entry so it never duplicates. */}
                          {row.key === journeyEntryKey && (
                            <EducationJourney text={row.currentSituation} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <CustomModalForm
        maxHeight="80vh"
        open={modalMode !== null}
        onOpenChange={(open) => {
          if (!open) closeModal();
        }}
        title={modalMode === "add" ? "Add Education" : "Edit Education"}
        fields={modalFields}
        onSubmit={handleSubmit}
        submitLabel="Save"
        cancelLabel="Cancel"
        isSubmitting={isSubmitting}
        submitButtonClassName="bg-black cursor-pointer"
        cancelButtonClassName="bg-black cursor-pointer"
        contentClassName="backdrop-blur-xl border shadow-2xl !rounded-xl bg-white border-gray-200 text-gray-900 [&_*]:text-gray-900 dark:bg-gradient-to-br dark:from-blue-600/20 dark:via-blue-500/15 dark:to-blue-700/20 dark:border-white/20 dark:text-white dark:[&_*]:text-white"
      />

      <ConfirmModal
        isOpen={deleteKey !== null}
        onClose={() => setDeleteKey(null)}
        onConfirm={handleDelete}
        icon={<Trash2 />}
        iconVariant="danger"
        title="Confirmation"
        message="Are you sure?"
        confirmText="Yes"
        cancelText="No"
        isLoading={deleteLoading}
        loadingText="Deleting..."
      />
    </div>
  );
}
