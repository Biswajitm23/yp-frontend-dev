'use client'

import React from 'react'
import { Bookmark, LoaderCircle, Sparkles } from 'lucide-react'
import styles from '@/moduleCss/jobs.module.css'
import { LogoWithFallback } from './InitialAvatar'
import JobLocations from './JobLocations'
import { getTimeAgoJobListing } from '@/helpers/dateFormatter'

/**
 * The canonical job card — the exact design used by the main `/jobs` listing:
 *   Row 1  logo | title + company + location chips | bookmark (save)
 *   Row 2  posted-time chip + employment-type chip
 *   Row 3  short description (only when present)
 *   Row 4  sector chip  ····  "View details →" button
 *
 * Extracted so every surface (jobs list, Recommended sidebars, Similar Jobs,
 * Company → Opportunities) renders an identical card. It is purely
 * presentational: all data lives on `job`, all behaviour comes in as callbacks
 * so each page keeps its own save / apply / navigation + cache logic.
 */

// Return the job's short_description as a tidy single-paragraph snippet (strips
// any HTML from a rich-text field). Returns null when absent so the card can
// hide the line entirely instead of showing placeholder text.
// `is_featured` arrives as a boolean today; also accept 1 / "1" / "true" so a
// string "0" from the backend can't light up the strip by being truthy.
// Mirrors the main /jobs listing (JobListing.tsx) exactly so Company →
// Opportunities and Job Details → Similar Jobs mark featured jobs identically.
const isFeaturedJob = (job: any): boolean =>
  job?.is_featured === true ||
  job?.is_featured == 1 ||
  job?.is_featured === 'true'

const getJobShortDescription = (job: any): string | null => {
  const raw = job?.short_description
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return null
}

export interface JobCardProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  job: any
  isLight: boolean
  /** Whether the job is saved (drives the bookmark fill / active state). */
  isSaved: boolean
  /** Whether a save/unsave request is in flight (shows a spinner). */
  isSaveBusy?: boolean
  /** Whether the current user has applied (footer button shows `appliedLabel`). */
  isApplied?: boolean
  /** Card body click — navigate to the job's details page. */
  onCardClick?: () => void
  /** Logo / company-name click — navigate to the company page. */
  onCompanyClick?: (companyId: any) => void
  /** Bookmark click — toggle saved. The page owns any confirm modal. */
  onToggleSave?: () => void
  /** Footer button click — "View details" (navigate to the job). */
  onPrimaryAction?: () => void
  /** Footer button label when not applied. Defaults to "View details". */
  primaryLabel?: string
  /** Footer button label when applied. Defaults to "Applied". */
  appliedLabel?: string
  /** Location chip cap. Omit to use the JobLocations default (3). */
  locationMaxVisible?: number
  /** Location chip strategy — 'fit' (default) or 'count'. */
  locationCollapseMode?: 'fit' | 'count'
  /** Show the short-description line when present. Defaults to true. */
  showDescription?: boolean
  /**
   * Render the location chips as a full-width row *below* the logo/title header
   * (flush to the card's left edge, under the logo) instead of inside the text
   * column beside the logo. Used by the narrow Recommended sidebar. Default false.
   */
  locationBelowHeader?: boolean
  /** Company-logo size in px. Defaults to 64 (the main-listing size). */
  logoSize?: number
  /** Optional extra className merged onto the card root. */
  className?: string
}

const JobCard: React.FC<JobCardProps> = ({
  job,
  isLight,
  isSaved,
  isSaveBusy = false,
  isApplied = false,
  onCardClick,
  onCompanyClick,
  onToggleSave,
  onPrimaryAction,
  primaryLabel = 'View details',
  appliedLabel = 'Applied',
  locationMaxVisible,
  locationCollapseMode = 'fit',
  showDescription = true,
  locationBelowHeader = false,
  logoSize = 64,
  className,
}) => {
  const description = showDescription ? getJobShortDescription(job) : null

  const locationRow = job.location?.length ? (
    <div className={styles.jobListing_job_item_location_row}>
      <JobLocations
        locations={job.location}
        isLight={isLight}
        title={job.title}
        maxVisible={locationMaxVisible}
        collapseMode={locationCollapseMode}
      />
    </div>
  ) : null

  return (
    <div
      className={`${styles.jobListing_job_item} ${
        isFeaturedJob(job) ? styles.jobListing_job_item_featured : ''
      } card-hover ${className ?? ''}`}
      onClick={onCardClick}
      style={{ cursor: 'pointer' }}
    >
      {isFeaturedJob(job) ? (
        <span className={styles.jobListing_featured_strip}>
          <Sparkles aria-hidden='true' />
          Featured
        </span>
      ) : null}
      <div className={styles.jobListing_card_main}>
        {/* Row 1: circle logo | title + company | save */}
        <div className={styles.jobListing_job_item_header}>
          <div
            className={styles.jobListing_card_logo}
            onClick={e => {
              e.stopPropagation()
              onCompanyClick?.(job?.company_id)
            }}
          >
            <LogoWithFallback
              src={job?.company_logo_url}
              name={job?.company_name || job?.title || ''}
              size={logoSize}
              borderRadius={14}
              alt={`${job.company_name} logo`}
              imgClassName={styles.jobListing_job_item_logo_img}
            />
          </div>

          {/* Title → company → location, stacked beside the logo */}
          <div className={styles.jobListing_job_item_headtext}>
            <h3
              className={styles.jobListing_job_item_title}
              style={isLight ? { color: '#040F1F' } : undefined}
            >
              {job.title}
            </h3>
            <p
              // Same clickable company row as the job listing card — keeps the
              // brand violet in both themes rather than a light-mode grey.
              className={`${styles.jobListing_job_item_company} ${styles.jobListing_job_item_company_link}`}
              onClick={e => {
                e.stopPropagation()
                onCompanyClick?.(job?.company_id)
              }}
            >
              <svg
                className={styles.jobListing_job_item_company_icon}
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <path d='M3 21h18' />
                <path d='M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16' />
                <path d='M16 21V9h3a2 2 0 0 1 2 2v10' />
                <path d='M8 7h2M8 11h2M8 15h2' />
              </svg>
              <span>{job.company_name}</span>
            </p>
            {/* Location sits inside the text column by default; the sidebar
                moves it to a full-width row below the header (see below). */}
            {!locationBelowHeader && locationRow}
          </div>

          {/* Save (bookmark icon) */}
          <button
            type='button'
            onClick={e => {
              e.stopPropagation()
              onToggleSave?.()
            }}
            disabled={isSaveBusy}
            aria-label={isSaved ? 'Remove from saved' : 'Save job'}
            title={isSaved ? 'Saved' : 'Save job'}
            className={`${styles.jobListing_bookmark_btn} ${
              isSaved ? styles.jobListing_bookmark_active : ''
            }`}
          >
            {isSaveBusy ? (
              <LoaderCircle className={styles.jobListing_spin} />
            ) : (
              <Bookmark fill={isSaved ? 'currentColor' : 'none'} />
            )}
          </button>
        </div>

        {/* Full-width location row (sidebar variant): flush to the card's left
            edge, under the logo — not indented into the text column. */}
        {locationBelowHeader && locationRow}

        {/* Row 2: posted time + employment type, left-aligned */}
        <div className={styles.jobListing_job_item_chips}>
          <span className={styles.jobListing_chip}>
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
              aria-hidden='true'
            >
              <circle cx='12' cy='12' r='9' />
              <path d='M12 7v5l3 2' />
            </svg>
            {getTimeAgoJobListing(job.created_at)}
          </span>
          {job.employment_type ? (
            <span className={styles.jobListing_chip}>
              <svg
                xmlns='http://www.w3.org/2000/svg'
                viewBox='0 0 2048 2048'
                aria-hidden='true'
              >
                <path d='M0 0h2048v2048H0z' fill='none' />
                <path
                  fill='currentColor'
                  d='M1582 1065q41 72 61 150t21 161v103l-640 321l-640-321q0-60 1-112t9-101t24-98t48-103L256 960v587q29 10 52 28t41 42t26 52t9 59v320H0v-320q0-30 9-58t26-53t40-42t53-28V896L0 832l1024-512l1024 512zM256 1728q0-26-19-45t-45-19t-45 19t-19 45v192h128zm30-896l738 369l738-369l-738-369zm1250 568q0-77-15-143t-53-135l-444 222l-444-222q-33 58-50 122t-18 132v24l512 256z'
                />
              </svg>
              {job.employment_type}
            </span>
          ) : null}
        </div>

        {/* Row 3: short description — only when present */}
        {description && (
          <p
            className={styles.jobListing_job_item_desc}
            style={isLight ? { color: '#555' } : undefined}
          >
            {description}
          </p>
        )}

        {/* Row 4: job sector + View details button */}
        <div className={styles.jobListing_job_item_footer}>
          {job.job_sector ? (
            <span className={styles.jobListing_sector_chip}>
              <svg
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.8'
                strokeLinecap='round'
                strokeLinejoin='round'
                aria-hidden='true'
              >
                <rect x='2' y='7' width='20' height='14' rx='2' />
                <path d='M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' />
              </svg>
              {job.job_sector}
            </span>
          ) : (
            <span />
          )}

          <button
            type='button'
            className={`${styles.jobListing_view_details} ${
              isApplied ? styles.jobListing_view_details_applied : ''
            }`}
            onClick={e => {
              e.stopPropagation()
              onPrimaryAction?.()
            }}
          >
            {isApplied ? appliedLabel : primaryLabel}
            <svg
              viewBox='0 0 24 24'
              fill='none'
              stroke='currentColor'
              strokeWidth='2'
              strokeLinecap='round'
              strokeLinejoin='round'
              aria-hidden='true'
            >
              <path d='M5 12h14' />
              <path d='m12 5 7 7-7 7' />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}

export default JobCard
