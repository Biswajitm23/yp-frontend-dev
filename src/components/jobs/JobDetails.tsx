'use client'
import { MapPin, Info, User, Bookmark, Briefcase, Sparkles } from 'lucide-react'
import BuildingIcon from '@/_assets/icons/header_icons/clarity_building-solid.svg'
import styles from '../../moduleCss/jobDetails.module.css'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import UserDefaultImg from '../../../public/profile/userProfile_image.png'
import DefaultJobProfile from '../../../public/images/DefaultJobImage.svg'
import { LogoWithFallback } from '../commonUI/InitialAvatar'
import JobCard from '../commonUI/JobCard'
import JobLocations from '../commonUI/JobLocations'
import DetailNotFound from '../commonUI/DetailNotFound'
import { useState, useEffect, useRef, useCallback, useMemo, Key } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'react-toastify'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTimeAgo } from '@/helpers/getTimeAgo'
import ProfileImagePreview from '../commonUI/ProfileImagePreview'
import Link from 'next/link'
import {
  fetchJobDetails,
  saveJob,
  unsaveJob,
  applyJob,
  fetchSimilarJobs
} from '@/services/jobs.services'
import { GlobalSpinner } from '../commonUI/loaders/spinners/GlobalSpinner'
import LogOutModal from '../commonUI/LogOutModal'
import { ensureValidToken } from '@/lib/tokenManager'
import { RenderHtmlContent } from '../commonUI/RenderHTMLContent'
import { sanitizeDescriptionHtml } from '@/lib/sanitizeHtml'
import CompanyCoverImageSkeleton from '../commonUI/loaders/skeletons/CompanyCoverImageSkeleton'
import JobCoverImage from './JobCoverImage'
import CompanyInfoSkeleton from '../commonUI/loaders/skeletons/CompanyInfoSkeleton'
import CompanyKeywordsSkeleton from '../commonUI/loaders/skeletons/CompanyKeywordsSkeleton'
import AboutCompanySkeleton from '../commonUI/loaders/skeletons/AboutCompanySkeleton'
import BottomTabSectionSkeleton from '../commonUI/loaders/skeletons/BottomTabSectionSkeleton'
import ConfirmModal from '../commonUI/ConfirmModal'
import { useApplyGate } from '@/app/hooks/useApplyGate'
import { useAuthGate } from '@/app/hooks/useAuthGate'
import { useTheme } from '@/context/ThemeContext'
import jobstyles from '../../moduleCss/jobs.module.css'
import companystyles from '../../moduleCss/comapnyDetails.module.css'

type Props = {
  jobId: string
}

export default function JobDetails ({ jobId }: Props) {
  // console.log('JOB ID:', jobId)

  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  const router = useRouter()
  const queryClient = useQueryClient()
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false)
  const [companyJobsPage, setCompanyJobsPage] = useState(1)
  const [allCompanyJobs, setAllCompanyJobs] = useState<any[]>([])
  const [hasMoreJobs, setHasMoreJobs] = useState(true)
  const [savingJobIds, setSavingJobIds] = useState<Set<string>>(new Set())
  const [unsavingJobIds, setUnsavingJobIds] = useState<Set<string>>(new Set())
  const [applyingJobIds, setApplyingJobIds] = useState<Set<string>>(new Set())
  const [jobRoleModalOpen, setJobRoleModalOpen] = useState(false)
  // Position the Job Role tooltip via a portal so it isn't clipped by the
  // surrounding `overflow-y: auto` scroll container.
  const jobRoleTriggerRef = useRef<HTMLSpanElement | null>(null)
  const [jobRoleTooltipPos, setJobRoleTooltipPos] = useState<{
    top: number
    left: number
  } | null>(null)
  const openJobRoleTooltip = () => {
    const rect = jobRoleTriggerRef.current?.getBoundingClientRect()
    if (rect) {
      // Anchor above the icon; tooltip itself is translated up via transform.
      setJobRoleTooltipPos({ top: rect.top, left: rect.left })
    }
    setJobRoleModalOpen(true)
  }
  const closeJobRoleTooltip = () => setJobRoleModalOpen(false)
  const [applyConfirmModal, setApplyConfirmModal] = useState<{
    jobId: string
    title: string
  } | null>(null)

  const companyJobsContainerRef = useRef<HTMLDivElement>(null)
  const JOBS_PER_PAGE = 4

  const {
    data: job,
    isLoading,
    isError
  } = useQuery({
    queryKey: ['job-details', jobId],
    queryFn: () => fetchJobDetails({ id: jobId }),
    enabled: !!jobId
  })

  useEffect(() => {
    setAllCompanyJobs([])
    setCompanyJobsPage(1)
    setHasMoreJobs(true)
  }, [job?.data?.id])

  // console.log('Job details from job details page: ', job)
  // console.log('Company id from job details page: ', job?.data?.company_id)
  // console.log('Current job id from job details page: ', job?.data?.id)

  // Fetch similar jobs with pagination
  const {
    data: companyJobsData,
    isLoading: companyJobsLoading,
    isError: companyJobsError
  } = useQuery({
    queryKey: ['similar-jobs', job?.data?.id, companyJobsPage],
    queryFn: () =>
      fetchSimilarJobs({
        limit: JOBS_PER_PAGE,
        page: companyJobsPage,
        id: job?.data?.id || ''
      }),
    enabled: !!job?.data?.id && hasMoreJobs
  })

  // console.log('Similar jobs from job details page: ', companyJobsData)

  useEffect(() => {
    if (companyJobsData?.jobs) {
      const newJobs = companyJobsData.jobs

      setAllCompanyJobs(prev => {
        const existingIds = new Set(prev.map(job => job.id))
        const uniqueNewJobs = newJobs.filter(
          (job: any) => !existingIds.has(job.id)
        )

        if (uniqueNewJobs.length === 0) return prev
        return [...prev, ...uniqueNewJobs]
      })

      if (newJobs.length < JOBS_PER_PAGE) {
        setHasMoreJobs(false)
      }
    }
  }, [companyJobsData])

  // Deduplicate before rendering
  const uniqueCompanyJobs = useMemo(() => {
    const seen = new Set<string>()
    return allCompanyJobs.filter(job => {
      if (seen.has(job.id) || job.id === jobId) return false
      seen.add(job.id)
      return true
    })
  }, [allCompanyJobs, jobId])

  // console.log('Unique similar jobs from job details page: ', uniqueCompanyJobs)

  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    if (!companyJobsContainerRef.current || !hasMoreJobs || companyJobsLoading)
      return

    const { scrollTop, scrollHeight, clientHeight } =
      companyJobsContainerRef.current

    if (scrollHeight - (scrollTop + clientHeight) < 200) {
      setCompanyJobsPage(prev => prev + 1)
    }
  }, [hasMoreJobs, companyJobsLoading])

  useEffect(() => {
    const container = companyJobsContainerRef.current
    if (!container) return

    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  /* ---------------- SAVE JOB MUTATION WITH OPTIMISTIC UPDATE ---------------- */
  const saveJobMutation = useMutation({
    // FIX: Added ensureValidToken to saveJobMutation (was missing, present in unsave/apply)
    mutationFn: async (id: string) => {
      await ensureValidToken()
      return saveJob({ id })
    },

    onMutate: async id => {
      setSavingJobIds(prev => new Set(prev).add(id))

      await queryClient.cancelQueries({ queryKey: ['job-details', id] })
      await queryClient.cancelQueries({
        queryKey: ['similar-jobs', job?.data?.id]
      })

      const prevJobDetails = queryClient.getQueryData<any>(['job-details', id])
      const prevSimilarJobs = queryClient.getQueryData<any>([
        'similar-jobs',
        job?.data?.id
      ])

      // Optimistically update allCompanyJobs state
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, saved_jobs: '1' } : job))
      )

      // Optimistically update job-details
      queryClient.setQueryData(['job-details', id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: {
            ...old.data,
            saved_jobs: '1'
          }
        }
      })

      // Optimistically update similar-jobs list
      queryClient.setQueryData(
        ['similar-jobs', job?.data?.id, companyJobsPage],
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            jobs: (old.jobs || []).map((j: any) =>
              j.id === id ? { ...j, saved_jobs: '1' } : j
            )
          }
        }
      )

      return { prevJobDetails, prevSimilarJobs }
    },

    onSuccess: (_, id) => {
      setSavingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      toast.success('Job saved successfully!')

      // FIX: Only invalidate save-related queries.
      // Do NOT invalidate "job-details" or "applied-jobs" — saving a job
      // has no effect on applied status, and invalidating those causes a
      // refetch that overwrites the optimistic applied_jobs state.
      queryClient.invalidateQueries({
        queryKey: ['similar-jobs', job?.data?.id],
        exact: false
      })
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },

    onError: (error, id, context: any) => {
      setSavingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, saved_jobs: '0' } : job))
      )
      if (context?.prevJobDetails) {
        queryClient.setQueryData(['job-details', id], context.prevJobDetails)
      }
      if (context?.prevSimilarJobs) {
        queryClient.setQueryData(
          ['similar-jobs', job?.data?.id],
          context.prevSimilarJobs
        )
      }
      toast.error('Failed to save job')
    }
  })

  const unsaveJobMutation = useMutation({
    mutationFn: async (id: string) => {
      await ensureValidToken()
      return unsaveJob({ id })
    },

    onMutate: async id => {
      setUnsavingJobIds(prev => new Set(prev).add(id))

      await queryClient.cancelQueries({ queryKey: ['job-details', id] })
      await queryClient.cancelQueries({
        queryKey: ['similar-jobs', job?.data?.id]
      })

      const prevJobDetails = queryClient.getQueryData<any>(['job-details', id])
      const prevSimilarJobs = queryClient.getQueryData<any>([
        'similar-jobs',
        job?.data?.id
      ])

      // Optimistically update allCompanyJobs state
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, saved_jobs: '0' } : job))
      )

      queryClient.setQueryData(['job-details', id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: {
            ...old.data,
            saved_jobs: '0'
          }
        }
      })

      queryClient.setQueryData(
        ['similar-jobs', job?.data?.id, companyJobsPage],
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            jobs: (old.jobs || []).map((j: any) =>
              j.id === id ? { ...j, saved_jobs: '0' } : j
            )
          }
        }
      )

      return { prevJobDetails, prevSimilarJobs }
    },

    onSuccess: (_, id) => {
      setUnsavingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      toast.success('Job removed successfully!')
      queryClient.invalidateQueries({
        queryKey: ['similar-jobs', job?.data?.id],
        exact: false
      })
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },

    onError: (error, id, context: any) => {
      setUnsavingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, saved_jobs: '1' } : job))
      )
      if (context?.prevJobDetails) {
        queryClient.setQueryData(['job-details', id], context.prevJobDetails)
      }
      if (context?.prevSimilarJobs) {
        queryClient.setQueryData(
          ['similar-jobs', job?.data?.id],
          context.prevSimilarJobs
        )
      }
      toast.error('Failed to unsave job')
    }
  })

  const applyJobMutation = useMutation({
    mutationFn: async (id: string) => {
      await ensureValidToken()
      return applyJob({ id })
    },

    onMutate: async id => {
      setApplyingJobIds(prev => new Set(prev).add(id))

      await queryClient.cancelQueries({ queryKey: ['job-details', id] })
      await queryClient.cancelQueries({
        queryKey: ['similar-jobs', job?.data?.id]
      })

      const prevJobDetails = queryClient.getQueryData<any>(['job-details', id])
      const prevSimilarJobs = queryClient.getQueryData<any>([
        'similar-jobs',
        job?.data?.id
      ])

      // Optimistically update allCompanyJobs state
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, applied_jobs: '1' } : job))
      )

      queryClient.setQueryData(['job-details', id], (old: any) => {
        if (!old) return old
        return {
          ...old,
          data: {
            ...old.data,
            applied_jobs: '1'
          }
        }
      })

      queryClient.setQueryData(
        ['similar-jobs', job?.data?.id, companyJobsPage],
        (old: any) => {
          if (!old) return old
          return {
            ...old,
            jobs: (old.jobs || []).map((j: any) =>
              j.id === id ? { ...j, applied_jobs: '1' } : j
            )
          }
        }
      )

      return { prevJobDetails, prevSimilarJobs }
    },

    onSuccess: (_, id) => {
      setApplyingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      toast.success('Job applied successfully')
      queryClient.invalidateQueries({
        queryKey: ['similar-jobs', job?.data?.id],
        exact: false
      })
      queryClient.invalidateQueries({ queryKey: ['applied-jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job-details'] })
      queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
    },

    onError: (error, id, context: any) => {
      setApplyingJobIds(prev => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
      setAllCompanyJobs(prev =>
        prev.map(job => (job.id === id ? { ...job, applied_jobs: '0' } : job))
      )
      if (context?.prevJobDetails) {
        queryClient.setQueryData(['job-details', id], context.prevJobDetails)
      }
      if (context?.prevSimilarJobs) {
        queryClient.setQueryData(
          ['similar-jobs', job?.data?.id],
          context.prevSimilarJobs
        )
      }
      toast.error('Failed to apply for job')
    }
  })

  // Tolerant saved/applied check — backend can return '1' (string) or 1 (number).
  const isSavedFlag = (v: any) => String(v) === '1'
  const isAppliedFlag = (v: any) => String(v) === '1'

  const handleSave = () => {
    ensureAuthed('save this job', () => {
      if (isSavedFlag(job?.data?.saved_jobs)) {
        // Unsave immediately — no confirmation needed.
        unsaveJobMutation.mutate(jobId)
      } else {
        saveJobMutation.mutate(jobId)
      }
    })
  }

  const { ensureCvReady, gateModal: applyGateModal } = useApplyGate()
  const { ensureAuthed, gateModal: authGateModal } = useAuthGate()

  // handleApply opens job_link in a new tab and posts Apply in the same click.
  // If no job_link is present, show a confirmation modal before posting Apply.
  const handleApply = () => {
    // Gate auth FIRST, then the existing CV gate, then apply.
    ensureAuthed('apply for this job', () => {
      if (job?.data?.job_link) {
        // External link → "Apply on Website": always open the link (even when
        // already applied, so the user can revisit the external form), but
        // record the application via user/applied-jobs only the first time.
        // No CV gate for external jobs; only direct-apply jobs require a CV.
        window.open(job.data.job_link, '_blank', 'noopener,noreferrer')
        if (
          !isAppliedFlag(job?.data?.applied_jobs) &&
          !applyingJobIds.has(jobId)
        ) {
          applyJobMutation.mutate(jobId)
        }
        return
      }
      if (isAppliedFlag(job?.data?.applied_jobs)) return
      ensureCvReady(job?.data?.title || 'this job', () => {
        setApplyConfirmModal({
          jobId: jobId,
          title: job?.data?.title || 'this job'
        })
      })
    })
  }

  const handleCompanyJobSave = (companyJobId: string, isSaved: boolean) => {
    ensureAuthed('save this job', () => {
      if (isSaved) {
        // Unsave immediately — no confirmation needed.
        unsaveJobMutation.mutate(companyJobId)
      } else {
        saveJobMutation.mutate(companyJobId)
      }
    })
  }

  // Similar/company jobs listed here are *other* jobs — applying is only
  // allowed from a job's own Details page, so this just opens that page.
  const handleCompanyJobApply = (companyJob: any) => {
    if (!companyJob?.id) return
    router.push(`/jobs/${companyJob.id}`)
  }

  const confirmApplyJob = () => {
    if (!applyConfirmModal) return
    applyJobMutation.mutate(applyConfirmModal.jobId)
    setApplyConfirmModal(null)
  }

  const cancelApplyJob = () => {
    setApplyConfirmModal(null)
  }

  const handleJobClick = (job: any) => {
    if (!job?.id) return
    router.push(`/jobs/${job.id}`)
  }

  // Data Section
  // Same check as the job listing cards: accept true / 1 / "1" / "true" so a
  // string "0" can't light the strip up by being truthy.
  const isFeatured =
    job?.data?.is_featured === true ||
    job?.data?.is_featured == 1 ||
    job?.data?.is_featured === 'true'

  const jobLocations: string[] = job?.data?.location?.length
    ? job.data.location
    : []

  // Loading State
  if (isLoading) {
    return (
      <div className='container mx-auto  px-4'>
        <CompanyCoverImageSkeleton />
        <CompanyInfoSkeleton />
        <CompanyKeywordsSkeleton />
        <AboutCompanySkeleton />
        <BottomTabSectionSkeleton />
      </div>
    )
  }

  // Not found / deleted: the id resolved but there's no real job behind it
  // (deleted job, invalid id, or an error response). Render a clean empty state
  // instead of the shell full of "?" placeholders and an empty title/Apply card.
  if (isError || !job?.data?.id) {
    return (
      <main className={styles.profileLayout}>
        {/* Standard page-header back button (matches every other detail page). */}
        <div className='container mx-auto px-4'>
          <div className={styles.pageHeader}>
            <div className={styles.top_area}>
              <div className='flex items-center gap-2'>
                <button
                  className='backbtn-page cursor-pointer'
                  onClick={() => router.back()}
                  type='button'
                  aria-label='Go back'
                >
                  <span>
                    <Image
                      src='/profile/backbtn_icon.svg'
                      alt='Back'
                      width={20}
                      height={20}
                    />
                  </span>
                </button>
                <h1 className={styles.pageTitle}>Job Details</h1>
              </div>
            </div>
          </div>
        </div>
        <DetailNotFound
          icon={<Briefcase size={28} />}
          title='Job not found'
          message='This job may have been removed or is no longer available.'
          primaryLabel='Browse Jobs'
          onPrimary={() => router.push('/jobs')}
        />
      </main>
    )
  }

  return (
    <main className={styles.profileLayout}>
      <div className='container mx-auto px-4'>
        <JobCoverImage jobDetails={job?.data} />

        <div className={styles.jobDetails_main_section}>
          <div
            className={`card_custom card_dark-bg gradient-card-bg ${styles.jobDetails_header_card} ${
              jobLocations.length === 0 && uniqueCompanyJobs.length > 0
                ? styles.jobDetails_header_card_tall
                : ''
            }`}
            style={{
              background: isLight ? 'transparent' : '',
              position: 'relative',
              padding: '24px',
              // Room for the Featured corner strip so it never covers the logo,
              // plus the same gold border as featured listing cards.
              ...(isFeatured
                ? {
                    paddingTop: '44px',
                    borderColor: isLight ? '#f0b54a' : '#f5b94280'
                  }
                : {})
            }}
          >
            {/* Featured corner strip — same design as the job listing cards */}
            {isFeatured ? (
              <span className={jobstyles.jobListing_featured_strip}>
                <Sparkles aria-hidden='true' />
                Featured
              </span>
            ) : null}
            {/* Bounce + tooltip keyframes */}
            <style>{`
              @keyframes jd-bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(3px)} }
              .jd-scroll-icon { animation: jd-bounce 1.5s ease-in-out infinite; display:flex; }
              .jd-action-btn { position:relative }
              .jd-action-btn::after {
                content: attr(data-tooltip);
                position: absolute; bottom: -32px; left: 50%;
                transform: translateX(-50%) scale(0.9);
                padding: 4px 10px; border-radius: 6px;
                font-size: 11px; font-weight: 500; white-space: nowrap;
                background: rgba(0,0,0,0.85); color: #fff;
                pointer-events: none; opacity: 0;
                transition: opacity 0.15s, transform 0.15s;
                z-index: 10;
              }
              .jd-action-btn:hover::after {
                opacity: 1; transform: translateX(-50%) scale(1);
              }
            `}</style>

            {/* Action buttons — right-side column. Save = listing bookmark icon,
                Apply = company "Follow" button design, View Similar = company
                "Opportunities" button design. `.jobDetails_header_info`
                padding-right reserves the gutter for this absolute column. */}
            <div
              className={styles.jobDetails_header_actions}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 12,
                zIndex: 2
              }}
            >
              {/* 1. Save / Unsave — icon button (matches the listing) */}
              <button
                type='button'
                disabled={savingJobIds.has(jobId) || unsavingJobIds.has(jobId)}
                onClick={handleSave}
                aria-label={
                  isSavedFlag(job?.data?.saved_jobs) ? 'Saved' : 'Save Job'
                }
                title={
                  isSavedFlag(job?.data?.saved_jobs) ? 'Saved' : 'Save Job'
                }
                className={`${jobstyles.jobListing_bookmark_btn} ${
                  isSavedFlag(job?.data?.saved_jobs)
                    ? jobstyles.jobListing_bookmark_active
                    : ''
                }`}
              >
                {savingJobIds.has(jobId) || unsavingJobIds.has(jobId) ? (
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      border: '2px solid currentColor',
                      borderTopColor: 'transparent',
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite'
                    }}
                  />
                ) : (
                  <Bookmark
                    size={20}
                    fill={
                      isSavedFlag(job?.data?.saved_jobs)
                        ? 'currentColor'
                        : 'none'
                    }
                  />
                )}
              </button>

              {/* 2. Apply on Website / Apply Job — company "Follow" button design */}
              {/* External-link jobs always stay "Apply on Website" and clickable,
                  even after applying, so the user can reopen the external form. */}
              {job?.data?.job_link ? (
                <button
                  type='button'
                  onClick={handleApply}
                  className={companystyles.follow_btn}
                >
                  Apply on Website
                </button>
              ) : (
                <button
                  type='button'
                  disabled={
                    applyingJobIds.has(jobId) ||
                    isAppliedFlag(job?.data?.applied_jobs)
                  }
                  onClick={handleApply}
                  className={`${companystyles.follow_btn} ${
                    isAppliedFlag(job?.data?.applied_jobs)
                      ? isLight
                        ? 'light-applied-btn'
                        : 'apply-btn'
                      : ''
                  }`}
                >
                  {isAppliedFlag(job?.data?.applied_jobs)
                    ? 'Applied'
                    : applyingJobIds.has(jobId)
                    ? 'Applying...'
                    : 'Apply Job'}
                </button>
              )}

              {/* 3. View Similar Jobs — company "Opportunities" button design */}
              {uniqueCompanyJobs.length > 0 && (
                <button
                  type='button'
                  onClick={() =>
                    document
                      .getElementById('similar-jobs-section')
                      ?.scrollIntoView({ behavior: 'smooth' })
                  }
                  className={companystyles.opportunities_btn}
                >
                  View Similar Jobs
                </button>
              )}
            </div>

            {/* Logo + Info — stacked layout */}
            <div
              className={styles.jobDetails_header_main}
              style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}
            >
              <div
                className={styles.jobDetails_job_item_logo}
                style={{ flexShrink: 0 }}
              >
                <LogoWithFallback
                  src={
                    job?.data?.company_color_url || job?.data?.company_logo_url
                  }
                  name={job?.data?.company_name || job?.data?.title || ''}
                  size={100}
                  borderRadius={16}
                  alt='logo'
                />
              </div>

              <div
                className={styles.jobDetails_header_info}
                style={{ flex: 1, minWidth: 0 }}
              >
                {/* Title */}
                <h2
                  className={styles.jobDetails_job_item_title}
                  style={{
                    color: isLight ? '#040F1F' : '#fff',
                    marginTop: 0,
                    fontSize: 22,
                    marginBottom: 6
                  }}
                >
                  {job?.data?.title}
                </h2>

                {/* Company */}
                <Link
                  href={`/company/${job?.data?.company_id}`}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    // Brand violet in BOTH themes, matching the mobile app — as
                    // muted grey this link was indistinguishable from the meta
                    // text around it.
                    color: '#5433FF',
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: 'none',
                    marginBottom: 12
                  }}
                >
                  <svg
                    width='14'
                    height='14'
                    viewBox='0 0 24 24'
                    fill='none'
                    stroke='currentColor'
                    strokeWidth='1.8'
                    strokeLinecap='round'
                    strokeLinejoin='round'
                  >
                    <path d='M3 21h18' />
                    <path d='M5 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16' />
                    <path d='M16 21V9h3a2 2 0 0 1 2 2v10' />
                    <path d='M8 7h2M8 11h2M8 15h2' />
                  </svg>
                  {job?.data?.company_name}
                </Link>

                {/* Locations — same chip design as the job listing */}
                {jobLocations.length > 0 && (
                  <div style={{ marginBottom: 10, marginTop: 4 }}>
                    <JobLocations
                      locations={jobLocations}
                      isLight={isLight}
                      title={job?.data?.title}
                    />
                  </div>
                )}

                {/* Chips row: time + employment type + salary */}
                <div
                  className={styles.jobDetails_header_chips}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 8,
                    alignItems: 'center',
                    marginTop: 4
                  }}
                >
                  {job?.data?.created_at && (
                    <span className={jobstyles.jobListing_chip}>
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
                      {getTimeAgo(job.data.created_at)}
                    </span>
                  )}
                  {job?.data?.employment_type && (
                    <span className={jobstyles.jobListing_chip}>
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
                      {job?.data?.employment_type}
                    </span>
                  )}
                  {job?.data?.salary_range && (
                    <span className={jobstyles.jobListing_chip}>
                      <svg
                        width='13'
                        height='13'
                        viewBox='0 0 32 32'
                        aria-hidden='true'
                      >
                        <path
                          fill='currentColor'
                          d='M2 22h28v2H2zm0 4h28v2H2zm22-16a2 2 0 1 0 2 2a2 2 0 0 0-2-2m-8 6a4 4 0 1 1 4-4a4.005 4.005 0 0 1-4 4m0-6a2 2 0 1 0 2 2a2 2 0 0 0-2-2m-8 0a2 2 0 1 0 2 2a2 2 0 0 0-2-2'
                        />
                        <path
                          fill='currentColor'
                          d='M28 20H4a2.005 2.005 0 0 1-2-2V6a2.005 2.005 0 0 1 2-2h24a2.005 2.005 0 0 1 2 2v12a2.003 2.003 0 0 1-2 2m0-14H4v12h24Z'
                        />
                      </svg>
                      {job?.data?.salary_range}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className='mt-4'>
            {/* 1. Overview Section — full width */}
            <div
              className={`card_custom card_dark-bg gradient-card-bg ${styles.jobDetails_overview_section}`}
            >
              <h2 className={styles.jobDetails_job_details_title_fixed}>
                Job Overview
              </h2>

              {job?.data?.keywords && job.data.keywords.length > 0 && (
                <div className={styles.jobDetails_overview_skills}>
                  <div className={styles.jobDetails_meta_box_header}>
                    <h4 className={styles.jobDetails_meta_box_title}>
                      Required Skills
                    </h4>
                  </div>
                  <div className={styles.jobDetails_meta_chips}>
                    {job?.data?.keywords?.map(
                      (keyword: string, index: Key | null | undefined) => (
                        <span
                          key={index}
                          className={styles.jobDetails_skill_chip}
                        >
                          {keyword}
                        </span>
                      )
                    )}
                  </div>
                </div>
              )}

              <div
                className={`${styles.jobDetails_overview_row} ${
                  job?.data?.keywords && job.data.keywords.length > 0
                    ? styles.jobDetails_overview_row_divided
                    : ''
                }`}
              >
                <div className={styles.jobDetails_overview_item}>
                  <div className={styles.jobDetails_meta_box_header}>
                    <h4 className={styles.jobDetails_meta_box_title}>
                      Job Sector
                    </h4>
                  </div>
                  <p className={styles.jobDetails_meta_box_value}>
                    <span>
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        width={18}
                        height={18}
                        viewBox='0 0 24 24'
                      >
                        <path d='M0 0h24v24H0z' fill='none' />
                        <path
                          fill='#4ea8ff'
                          d='M19 6.5h-3v-1a3 3 0 0 0-3-3h-2a3 3 0 0 0-3 3v1H5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-9a3 3 0 0 0-3-3m-9-1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1h-4Zm10 13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-5.05h3v1.05a1 1 0 0 0 2 0v-1.05h6v1.05a1 1 0 0 0 2 0v-1.05h3Zm0-7H4v-2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1Z'
                        />
                      </svg>
                    </span>
                    {job?.data?.job_sector || 'N/A'}
                  </p>
                </div>

                <div className={styles.jobDetails_overview_item}>
                  <div className={styles.jobDetails_meta_box_header}>
                    <h4 className={styles.jobDetails_meta_box_title}>
                      Job Role
                    </h4>
                    {job?.data?.job_role?.explanation && (
                      <span
                        ref={jobRoleTriggerRef}
                        onMouseEnter={openJobRoleTooltip}
                        onMouseLeave={closeJobRoleTooltip}
                        onFocus={openJobRoleTooltip}
                        onBlur={closeJobRoleTooltip}
                        tabIndex={0}
                        style={{
                          display: 'inline-flex',
                          cursor: 'pointer',
                          color: isLight ? '#000' : '#FFF',
                          flexShrink: 0
                        }}
                        aria-label='Show job role details'
                      >
                        <Info size={16} />
                        {jobRoleModalOpen &&
                          jobRoleTooltipPos &&
                          typeof document !== 'undefined' &&
                          createPortal(
                            <span
                              role='tooltip'
                              style={{
                                position: 'fixed',
                                top: jobRoleTooltipPos.top - 10,
                                left: jobRoleTooltipPos.left,
                                transform: 'translateY(-100%)',
                                width: 'max-content',
                                maxWidth: 360,
                                padding: '12px 14px',
                                background: isLight ? '#FFFFFF' : '#0B172A',
                                border: isLight
                                  ? '1px solid rgba(0,0,0,0.08)'
                                  : '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 10,
                                boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
                                color: isLight ? '#555' : '#D6DEEC',
                                fontFamily: 'var(--font-dm-sans)',
                                fontSize: 12,
                                fontWeight: 400,
                                lineHeight: 1.55,
                                textAlign: 'left',
                                whiteSpace: 'normal',
                                wordBreak: 'normal',
                                overflowWrap: 'anywhere',
                                cursor: 'default',
                                zIndex: 1000,
                                pointerEvents: 'none'
                              }}
                            >
                              {job?.data?.job_role?.role && (
                                <span
                                  style={{
                                    display: 'block',
                                    marginBottom: 6,
                                    fontFamily: 'var(--font-plus-jakarta)',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    lineHeight: 1.3,
                                    color: isLight ? '#040F1F' : '#FFFFFF'
                                  }}
                                >
                                  {job.data.job_role.role}
                                </span>
                              )}
                              <span
                                className='ql-render'
                                dangerouslySetInnerHTML={{
                                  __html: sanitizeDescriptionHtml(
                                    job.data.job_role.explanation
                                  )
                                }}
                              />
                              <span
                                aria-hidden='true'
                                style={{
                                  position: 'absolute',
                                  top: '100%',
                                  left: 8,
                                  width: 0,
                                  height: 0,
                                  borderLeft: '6px solid transparent',
                                  borderRight: '6px solid transparent',
                                  borderTop: `6px solid ${
                                    isLight ? '#FFFFFF' : '#0B172A'
                                  }`
                                }}
                              />
                            </span>,
                            document.body
                          )}
                      </span>
                    )}
                  </div>
                  <p className={styles.jobDetails_meta_box_value}>
                    <span>
                     <svg xmlns="http://www.w3.org/2000/svg" width="18px" height="18px" viewBox="0 0 24 24">
  <path d="M0 0h24v24H0z" fill="none" />
  <path fill="#4ea8ff" d="M12 12c2.76 0 5-2.24 5-5s-2.24-5-5-5s-5 2.24-5 5s2.24 5 5 5m0-8c1.65 0 3 1.35 3 3s-1.35 3-3 3s-3-1.35-3-3s1.35-3 3-3M4 22h16c.55 0 1-.45 1-1v-1c0-3.86-3.14-7-7-7h-4c-3.86 0-7 3.14-7 7v1c0 .55.45 1 1 1m6-7h4c2.76 0 5 2.24 5 5H5c0-2.76 2.24-5 5-5" />
</svg>

                    </span>
                    {job?.data?.job_role?.role || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. About the Job + About the Company — equal-height pair */}
            <div className={styles.jobDetails_two_col}>
              <div
                className={`card_custom card_dark-bg gradient-card-bg ${styles.jobDetails_panel}`}
              >
                <div className={styles.jobDetails_job_details_content}>
                  <h2 className={styles.jobDetails_job_details_title_fixed}>
                    About the Job
                  </h2>
                  <div
                    className={styles.jobDetails_job_details_description_scroll}
                  >
                    {job?.data?.description && (
                      <div className='mb-8'>
                        <h4
                          className={
                            styles.jobDetails_job_details_description_subtitle
                          }
                        >
                          Job Description
                        </h4>
                        <RenderHtmlContent
                          html={job?.data?.description}
                          className={
                            styles.jobDetails_job_details_description_text
                          }
                        />
                      </div>
                    )}

                    {job?.data?.requirements && (
                      <div className='mb-8'>
                        <h4
                          className={
                            styles.jobDetails_job_details_description_subtitle
                          }
                        >
                          Requirements
                        </h4>
                        <p
                          className={
                            styles.jobDetails_job_details_description_text
                          }
                        >
                          {job?.data?.requirements}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`${styles.jobListing_card_company_inner} card-company-details bg-gradient-card ${styles.jobDetails_panel}`}
              >
                <h2
                  className={styles.jobListing_card_title}
                  style={{
                    color: isLight ? '#040F1F' : 'rgba(255, 255, 255, 1)'
                  }}
                >
                  About the Company
                </h2>
                <div
                  className={`${styles.jobListing_company_card} card-hover`}
                  onClick={e => {
                    e.stopPropagation()
                    router.push(`/company/${job?.data?.company_id}`)
                  }}
                >
                  <div className='flex align-middle gap-4'>
                    <div className={styles.jobDetails_job_company_card_logo}>
                      <LogoWithFallback
                        src={
                          job?.data?.company_color_url ||
                          job?.data?.company_logo_url
                        }
                        name={job?.data?.company_name || ''}
                        size={70}
                        borderRadius={12}
                        alt='logo'
                      />
                    </div>
                    <div
                      className={styles.jobDetails_job_item_info}
                      style={{ justifyContent: 'flex-start', gap: 6 }}
                    >
                      <h2 className={styles.jobDetails_job_item_company}>
                        <Link href={`/company/${job?.data?.company_id}`}>
                          {job?.data?.company_name}
                        </Link>
                      </h2>

                      {job?.data?.company_address && (
                        <div className='flex items-start gap-1 -mt-2'>
                          <MapPin
                            height={16}
                            width={16}
                            color={isLight ? '#888888' : '#A0AEC0'}
                          />
                          <p className={styles.jobDetails_job_item_location}>
                            {job.data.company_address}
                          </p>
                        </div>
                      )}
                      {job?.data?.job_sector && (
                        <div className='flex flex-col gap-1'>
                          <span
                            className='flex items-center gap-1'
                            style={{
                              color: isLight ? '#888888' : '#A0AEC0',
                              fontFamily: 'var(--font-dm-sans)',
                              fontSize: 12,
                              fontWeight: 400,
                              lineHeight: 1
                            }}
                          >
                            <Image
                              src={BuildingIcon}
                              alt='Industry'
                              width={14}
                              height={14}
                              style={
                                isLight
                                  ? {
                                      filter:
                                        'brightness(0) saturate(100%) invert(60%) sepia(6%) saturate(735%) hue-rotate(178deg) brightness(90%) contrast(88%)'
                                    }
                                  : {
                                      filter:
                                        'brightness(0) saturate(100%) invert(74%) sepia(6%) saturate(735%) hue-rotate(178deg) brightness(90%) contrast(88%)'
                                    }
                              }
                            />
                            Industry
                          </span>
                          <p
                            style={{
                              color: isLight ? '#040F1F' : '#FFFFFF',
                              fontFamily: 'var(--font-dm-sans)',
                              fontSize: 14,
                              fontWeight: 400,
                              lineHeight: 1.2,
                              margin: 0
                            }}
                          >
                            {job.data.job_sector}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className={
                    styles.jobDetails_job_company_description_scrollable
                  }
                >
                  <RenderHtmlContent
                    html={job?.data?.company_description}
                    className={styles.jobDetails_job_company_description}
                  />
                </div>
              </div>
            </div>

            {/* 3. Similar Jobs — full width at the bottom. Only render the
                whole section when there are actually similar jobs to show. */}
            {uniqueCompanyJobs.length > 0 && (
              <div
                id='similar-jobs-section'
                className={`${styles.jobListing_card_morejob_inner} card-company-details gradient-card-bg`}
              >
                <h2
                  className={styles.jobListing_card_title}
                  style={{
                    color: isLight ? '#040F1F' : 'rgba(255, 255, 255, 1)'
                  }}
                >
                  Similar Jobs
                </h2>

                <div
                  ref={companyJobsContainerRef}
                  className={styles.jobListing_more_jobs_card_wrapper}
                  style={{ overflowY: 'auto' }}
                >
                  {allCompanyJobs.length === 0 && !companyJobsLoading ? (
                    <div className='text-center py-8'>
                      <p className='text-gray-400'>No jobs available</p>
                    </div>
                  ) : (
                    <>
                      <div className={styles.jobDetails_similar_grid}>
                        {uniqueCompanyJobs.map(companyJob => (
                          <JobCard
                            key={companyJob.id}
                            job={companyJob}
                            isLight={isLight}
                            isSaved={isSavedFlag(companyJob.saved_jobs)}
                            isSaveBusy={
                              savingJobIds.has(companyJob.id) ||
                              unsavingJobIds.has(companyJob.id)
                            }
                            onCardClick={() => handleJobClick(companyJob)}
                            onCompanyClick={companyId =>
                              router.push(`/company/${companyId}`)
                            }
                            onToggleSave={() =>
                              handleCompanyJobSave(
                                companyJob.id,
                                isSavedFlag(companyJob.saved_jobs)
                              )
                            }
                            onPrimaryAction={() =>
                              handleCompanyJobApply(companyJob)
                            }
                          />
                        ))}
                      </div>

                      {companyJobsLoading && (
                        <div className='flex items-center justify-center py-6'>
                          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500'></div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {job?.data?.company_logo_url && (
        <ProfileImagePreview
          isOpen={isImagePreviewOpen}
          onClose={() => setIsImagePreviewOpen(false)}
          imageUrl={job?.data?.company_logo_url}
          firstName={job?.data?.company_name}
          lastName={''}
        />
      )}

      <ConfirmModal
        isOpen={!!applyConfirmModal}
        onClose={cancelApplyJob}
        icon={<Briefcase />}
        iconVariant="primary"
        title='Apply for Job'
        message={`Are you sure you want to apply for ${
          applyConfirmModal?.title ?? 'this job'
        }?`}
        onConfirm={confirmApplyJob}
        confirmText='Apply'
        cancelText='Cancel'
        isLoading={applyJobMutation.isPending}
        loadingText='Applying...'
      />
      {applyGateModal}
      {authGateModal}
    </main>
  )
}
