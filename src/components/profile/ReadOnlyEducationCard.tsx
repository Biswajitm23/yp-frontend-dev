// components/profile/ReadOnlyEducationCard.tsx
// Read-only twin of EducationCard, used on another user's profile. Same
// accordion layout and the same `educations[]` → row mapping (both come from
// educationEntries.tsx); the only difference is that Add / Edit / Delete are
// absent.
"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ChevronDown } from "lucide-react";
import styles from "../../moduleCss/profile.module.css";
import DummyUniversity from "../../../public/images/DummyUniversity.png";
import {
  buildEducationEntries,
  educationCourseLabel,
  getJourneyEntryKey,
  EducationJourney,
  StatusIcon,
  type EducationSource,
} from "./educationEntries";

export default function ReadOnlyEducationCard({
  educations,
  university,
  degree,
  duration,
  careerStatus,
  currentSituation,
}: EducationSource) {
  const entries = useMemo(
    () =>
      buildEducationEntries({
        educations,
        university,
        degree,
        duration,
        careerStatus,
        currentSituation,
      }),
    [educations, university, degree, duration, careerStatus, currentSituation],
  );

  // Accordion: only ONE entry is open at a time. Derived rather than synced in
  // an effect — `undefined` means the user hasn't touched it yet (default: the
  // first entry, which also covers "single entry is always open"), `null` means
  // they explicitly collapsed everything.
  const [selectedKey, setSelectedKey] = useState<string | null | undefined>(
    undefined,
  );
  const defaultKey = entries.length > 0 ? entries[0].key : null;
  const openKey =
    selectedKey === undefined
      ? defaultKey
      : selectedKey === null
        ? null
        : // A key from a previous props payload falls back to the first entry.
          entries.some((e) => e.key === selectedKey)
          ? selectedKey
          : defaultKey;

  const journeyEntryKey = useMemo(() => getJourneyEntryKey(entries), [entries]);

  const toggleOpen = (key: string) => {
    setSelectedKey(openKey === key ? null : key);
  };

  return (
    <div className={styles.educationCard}>
      <div className="card_custom card_dark-bg">
        <div className={styles.profileInfo}>
          <div className={`${styles.nameWrapper}`}>
            <h2 className={styles.section_title}>Education</h2>
          </div>

          {/* Entry list — scrolls inside so the card height stays fixed and the
              neighbouring card is unaffected. */}
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

                //   • single entry  → always open (chevron hidden)
                //   • multiple      → first open, the rest collapsed
                const isSingle = entries.length === 1;
                const isOpen = isSingle || openKey === row.key;
                const headerLabel =
                  idx === 0 ? "Current Status" : "Education Level";

                return (
                  <div
                    key={row.key}
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
                        mirrors the open state. */}
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
                    </div>

                    {/* Body — institution details / current situation. Always
                        mounted and animated open/close via grid-rows (0fr → 1fr)
                        so the height transition runs in both directions. */}
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
                                      {educationCourseLabel(row)}
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

                          {/* Current Situation — single shared value, rendered
                              only on the latest contextual entry. */}
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
    </div>
  );
}
