/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable react-hooks/set-state-in-effect */
'use client'

import {
  Search,
  Home,
  Users,
  MessageCircle,
  Bell,
  Briefcase,
  Bookmark,
  Star,
  CircleCheck,
  LoaderCircle,
  X
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'

import {
  useInfiniteQuery,
  useQuery,
  useMutation,
  useQueryClient
} from '@tanstack/react-query'
// OPTIMIZED
import {
  fetchJobs,
  fetchRecomendedJobs,
  fetchSavedJobs,
  fetchAppliedJobs,
  saveJob,
  unsaveJob,
  fetchFilterList,
  applyJob
} from '@/services/jobs.services'
import styles from '@/moduleCss/jobs.module.css'
import styleSheet from '@/_assets/style/style.module.css'
import { useUserProfile } from '@/app/hooks/useUserProfile'
import DefaultJobProfile from '../../../public/images/DefaultJobImage.svg'
import Image from 'next/image'
import UserDefaultImg from '../../../public/profile/default_user_icon.png'
import Tooltip from '@mui/material/Tooltip'
import useDebounce from '@/app/hooks/useDebounce'
import React from 'react'
import SortByPills, { DEFAULT_SORT_GROUPS } from '../commonUI/SortByPills'
import FilterSortTrigger from '../commonUI/FilterSortTrigger'
import FilterSortModal, { FilterSection } from '../commonUI/FilterSortModal'
import JobCardSkeleton from '../commonUI/loaders/skeletons/JobCardSkeleton'
import { toast } from 'react-toastify'
import mainstyles from '@/moduleCss/jobDetails.module.css'
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow'
// import LogOutModal from "../commonUI/LogOutModal";
import ConfirmModal from '../commonUI/ConfirmModal'
import { useApplyGate } from '@/app/hooks/useApplyGate'
import { useAuthGate } from '@/app/hooks/useAuthGate'
import { isUnauthenticatedError } from '@/lib/authError'
import { useHasSession } from '@/app/hooks/useHasSession'
import { ensureValidToken } from '@/lib/tokenManager'
import Avatar from '../commonUI/Avatar'
import { LogoWithFallback } from '../commonUI/InitialAvatar'
import ProfileCardsmall from '../commonUI/ProfileCardsmall'
import RecommendedInfoTooltip from '../commonUI/RecommendedInfoTooltip'
import BriefcaseIcon from '../commonUI/icons/BriefcaseIcon'
import JobLocations from '../commonUI/JobLocations'
import { getTimeAgoJobListing } from '@/helpers/dateFormatter'
import { useListingPreserve } from '@/app/hooks/useListingPreserve'
import { useListingState } from '@/app/hooks/useListingState'
import { useTheme } from '@/context/ThemeContext'

type TabType = 'all' | 'saved' | 'recommended' | 'latest'

// Return the job's short_description as a tidy single-paragraph snippet (strips
// any HTML from a rich-text field). Returns null when absent so the card can
// hide the line entirely instead of showing placeholder text.
/**
 * Sidebar tab icon — outline normally, solid once the tab is active. lucide
 * ships stroked paths with `fill: none`, so the filled variant is the same
 * glyph with `fill: currentColor`; colour is inherited from the button, which
 * keeps both themes correct without a second icon set.
 *
 * CircleCheck is the exception: filling its disc would swallow the tick, since
 * both are drawn in currentColor. `knockout` restores the tick by stroking it
 * in the page colour instead.
 */
const TabIcon = ({
  icon: Icon,
  active,
  knockout
}: {
  icon: LucideIcon
  active: boolean
  knockout?: string
}) => (
  <Icon
    size={16}
    className='shrink-0'
    aria-hidden='true'
    fill={active ? 'currentColor' : 'none'}
    {...(active && knockout ? { stroke: knockout } : {})}
  />
)

const getJobShortDescription = (job: any): string | null => {
  const raw = job?.short_description
  if (typeof raw === 'string' && raw.trim()) {
    return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  return null
}

const JobListing = () => {
  const [showFiltersModal, setShowFiltersModal] = useState(false)
  const [applyConfirmModal, setApplyConfirmModal] = useState<{
    jobId: string
    title: string
  } | null>(null)
  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  // Persist UI state across back-navigation from /jobs/<id>. Local state is
  // seeded from the persisted blob on first render and mirrored back on
  // change via the single effect below.
  const [persisted, setPersisted] = useListingState('job-list', {
    activeTab: 'all' as TabType,
    showAppliedJobs: false,
    selectedFilters: {
      company_id: [] as string[],
      jobsector: [] as string[],
      employment_type: [] as string[],
      job_location: [] as string[],
    },
    serverSearchInput: '',
    clientSearchInput: '',
    sortBy: 'recently_added',
  })

  const [activeTab, setActiveTab] = useState<TabType>(persisted.activeTab)
  const [showAppliedJobs, setShowAppliedJobs] = useState(persisted.showAppliedJobs)
  const [savingJobId, setSavingJobId] = useState<string | null>(null)
  const [unsavingJobId, setUnsavingJobId] = useState<string | null>(null)
  const [applyingJobId, setApplyingJobId] = useState<string | null>(null)
  const [selectedFilters, setSelectedFilters] = useState(persisted.selectedFilters)

  const searchParams = useSearchParams()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { data: hasSession } = useHasSession()
  const currentPathname = usePathname()

  const { saveBeforeNavigate, setScrollContainer } = useListingPreserve('job-list')

  const [serverSearchInput, setServerSearchInput] = useState(persisted.serverSearchInput)
  const [clientSearchInput, setClientSearchInput] = useState(persisted.clientSearchInput)
  const [sortBy, setSortBy] = useState<string>(persisted.sortBy || 'recently_added')

  useEffect(() => {
    setPersisted({
      activeTab,
      showAppliedJobs,
      selectedFilters,
      serverSearchInput,
      clientSearchInput,
      sortBy,
    })
  }, [activeTab, showAppliedJobs, selectedFilters, serverSearchInput, clientSearchInput, sortBy, setPersisted])

  const urlSearchQuery = searchParams.get('q') || ''

  const debouncedServerSearch = useDebounce(serverSearchInput, 500)

  const [isSearching, setIsSearching] = useState(false)
  const [isFilterOpen, setIsFilterOpen] = useState(false)

  const incrementSavedCount = (old: any, delta: number) => {
    if (!old?.pages) return old

    return {
      ...old,
      pages: old.pages.map((page: any, index: number) =>
        index === 0
          ? {
              ...page,
              data: {
                ...page.data,
                total_count: Math.max(0, (page.data.total_count || 0) + delta)
              }
            }
          : page
      )
    }
  }

  // The Saved / Recommended / Applied services unwrap one extra level
  // (`res.data.data`) while the public jobs service returns the full body
  // (`res.data`). Read each list page's `result` / `total_count` tolerant to
  // BOTH nestings so these strict lists render regardless of the exact backend
  // envelope shape (a single source of truth instead of `page?.data?.result`
  // scattered everywhere). Anonymous users never reach here — the queries are
  // gated on `hasSession === true`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageResult = (page: any): any[] =>
    page?.data?.result ?? page?.result ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageTotalCount = (page: any): number =>
    page?.data?.total_count ?? page?.total_count ?? 0

  /* ---------------- USER PROFILE ---------------- */
  const { data: userProfile, isLoading: userProfileLoading } = useUserProfile()

  const getQueryKey = useCallback(() => {
    const currentTab = showAppliedJobs ? 'applied' : activeTab
    return [
      'jobs',
      {
        tab: currentTab,
        search: currentTab === 'all' ? urlSearchQuery : '',
        filters: currentTab === 'all' ? selectedFilters : {}
      }
    ]
  }, [activeTab, showAppliedJobs, urlSearchQuery, selectedFilters])

  /* ===================== SEARCH URL SYNC - MERGED EFFECTS ===================== */
  // FIX #3: Merged two duplicate useEffect into one
  useEffect(() => {
    if (activeTab !== 'all' || showAppliedJobs) return

    const params = new URLSearchParams()

    if (debouncedServerSearch.length >= 2) {
      params.set('q', debouncedServerSearch)
      router.push(`${currentPathname}?${params.toString()}`, { scroll: false })
    } else if (debouncedServerSearch.length === 0 && urlSearchQuery) {
      router.replace(currentPathname, { scroll: false })
    }
  }, [
    debouncedServerSearch,
    activeTab,
    showAppliedJobs,
    currentPathname,
    router,
    urlSearchQuery
  ])

  /* ===================== FILTER INVALIDATION OPTIMIZATION ===================== */
  useEffect(() => {
    if (activeTab === 'all') {
      queryClient.invalidateQueries({
        queryKey: ['jobs', { tab: 'all' }]
      })
    }
  }, [selectedFilters, activeTab, queryClient])

  // Snapshot of filters / sort that the All-tab *server* query consumes.
  // It only tracks `selectedFilters` / `sortBy` while the user is actually on
  // the All tab — so applying filters on Saved / Recommended / Applied (which
  // are filtered client-side) doesn't refetch the All query and shrink the
  // sidebar "All Jobs (n)" count.
  const [allTabFilters, setAllTabFilters] = useState(selectedFilters)
  const [allTabSortBy, setAllTabSortBy] = useState(sortBy)
  useEffect(() => {
    if (activeTab === 'all' && !showAppliedJobs) {
      setAllTabFilters(selectedFilters)
      setAllTabSortBy(sortBy)
    }
  }, [activeTab, showAppliedJobs, selectedFilters, sortBy])

  const arrayToCommaSeparatedString = (arr: string[]): string | undefined => {
    if (!arr || arr.length === 0) return undefined
    return arr.join(', ')
  }

  /* ---------------- SAVE JOB MUTATION WITH OPTIMISTIC UPDATE ---------------- */
  const saveJobMutation = useMutation({
    // mutationFn: (jobId: string) => saveJob({ id: jobId }),
    mutationFn: async (jobId: string) => {
      await ensureValidToken()
      return saveJob({ id: jobId })
    },
    onMutate: async jobId => {
      setSavingJobId(jobId)
      await queryClient.cancelQueries({ queryKey: ['saved-jobs'] })

      const previousSavedJobs = queryClient.getQueryData(['saved-jobs'])

      queryClient.setQueryData(['saved-jobs'], (old: any) => {
        if (!old) return old
        const allJobsData = queryClient.getQueryData([
          'jobs',
          { search: urlSearchQuery }
        ]) as any
        const recommendedJobsData = queryClient.getQueryData([
          'recommended-jobs'
        ]) as any

        let jobToAdd = null

        if (allJobsData?.pages) {
          for (const page of allJobsData.pages) {
            const found = page?.data?.result?.find((j: any) => j.id === jobId)
            if (found) {
              jobToAdd = found
              break
            }
          }
        }

        if (!jobToAdd && recommendedJobsData?.pages) {
          for (const page of recommendedJobsData.pages) {
            const found = page?.data?.result?.find((j: any) => j.id === jobId)
            if (found) {
              jobToAdd = found
              break
            }
          }
        }

        if (jobToAdd && old.pages) {
          const newPages = [...old.pages]
          if (newPages[0]?.data?.result) {
            newPages[0] = {
              ...newPages[0],
              data: {
                ...newPages[0].data,
                result: [jobToAdd, ...newPages[0].data.result],
                total_count: (newPages[0].data.total_count || 0) + 1
              }
            }
          }
          return { ...old, pages: newPages }
        }
        return old
      })

      // Optimistically update saved_jobs property in all jobs queries
      queryClient.setQueriesData({ queryKey: ['jobs'] }, (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 1 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      // Also update recommended-jobs query
      queryClient.setQueryData(['recommended-jobs'], (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 1 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      queryClient.setQueryData(['applied-jobs'], (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => {
            const source = page?.data?.result ?? page?.result
            if (!source) return page
            const mapped = source.map((job: any) =>
              job.id === jobId ? { ...job, saved_jobs: 1 } : job
            )
            return page?.data?.result
              ? { ...page, data: { ...page.data, result: mapped } }
              : { ...page, result: mapped }
          })
        }
      })

      return { previousSavedJobs }
    },
    onSuccess: async () => {
      toast.success('Job saved successfully!')
      // Await invalidation before clearing loading state to prevent flash
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs', { tab: 'saved' }] }),
        queryClient.invalidateQueries({ queryKey: ['recommended-jobs-top'] }),
        queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
      ])
      setSavingJobId(null)
    },
    onError: (error: any, jobId, context: any) => {
      if (isUnauthenticatedError(error)) openGate('save this job')
      console.error('Failed to save job:', error.message)
      setSavingJobId(null)
      if (context?.previousSavedJobs) {
        queryClient.setQueryData(['saved-jobs'], context.previousSavedJobs)
      }
      // Revert the optimistic updates on error
      queryClient.setQueriesData({ queryKey: ['jobs'] }, (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 0 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })
      queryClient.setQueryData(['recommended-jobs'], (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 0 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      queryClient.setQueryData(['applied-jobs'], (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => {
            const source = page?.data?.result ?? page?.result
            if (!source) return page
            const mapped = source.map((job: any) =>
              job.id === jobId ? { ...job, saved_jobs: 0 } : job
            )
            return page?.data?.result
              ? { ...page, data: { ...page.data, result: mapped } }
              : { ...page, result: mapped }
          })
        }
      })
    }
  })

  /* ---------------- UNSAVE JOB MUTATION WITH OPTIMISTIC UPDATE ---------------- */
  const unsaveJobMutation = useMutation({
    // mutationFn: (jobId: string) => unsaveJob({ id: jobId }),
    mutationFn: async (jobId: string) => {
      await ensureValidToken()
      return unsaveJob({ id: jobId })
    },
    onMutate: async jobId => {
      setUnsavingJobId(jobId)
      await queryClient.cancelQueries({ queryKey: ['saved-jobs'] })

      const previousSavedJobs = queryClient.getQueryData(['saved-jobs'])

      queryClient.setQueryData(['saved-jobs'], (old: any) => {
        if (!old?.pages) return old

        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page

          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.filter((job: any) => job.id !== jobId),
              total_count: Math.max(0, (page.data.total_count || 0) - 1)
            }
          }
        })

        return { ...old, pages: newPages }
      })

      // Optimistically update saved_jobs property in all jobs queries
      queryClient.setQueriesData({ queryKey: ['jobs'] }, (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 0 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      // Also update recommended-jobs query
      queryClient.setQueryData(['recommended-jobs'], (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 0 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      queryClient.setQueryData(['applied-jobs'], (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => {
            const source = page?.data?.result ?? page?.result
            if (!source) return page
            const mapped = source.map((job: any) =>
              job.id === jobId ? { ...job, saved_jobs: 0 } : job
            )
            return page?.data?.result
              ? { ...page, data: { ...page.data, result: mapped } }
              : { ...page, result: mapped }
          })
        }
      })

      return { previousSavedJobs }
    },
    onSuccess: async () => {
      toast.success('Job removed successfully!')
      // Await invalidation before clearing loading state to prevent flash
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs', { tab: 'saved' }] }),
        queryClient.invalidateQueries({ queryKey: ['recommended-jobs-top'] }),
        queryClient.invalidateQueries({ queryKey: ['saved-jobs'] })
      ])
      setUnsavingJobId(null)
    },
    onError: (error: any, jobId, context: any) => {
      if (isUnauthenticatedError(error)) openGate('remove this saved job')
      console.error('Failed to unsave job:', error.message)
      setUnsavingJobId(null)
      if (context?.previousSavedJobs) {
        queryClient.setQueryData(['saved-jobs'], context.previousSavedJobs)
      }
      // Revert the optimistic updates on error
      queryClient.setQueriesData({ queryKey: ['jobs'] }, (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 1 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })
      queryClient.setQueryData(['recommended-jobs'], (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, saved_jobs: 1 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      })

      queryClient.setQueryData(['applied-jobs'], (old: any) => {
        if (!old?.pages) return old
        return {
          ...old,
          pages: old.pages.map((page: any) => {
            const source = page?.data?.result ?? page?.result
            if (!source) return page
            const mapped = source.map((job: any) =>
              job.id === jobId ? { ...job, saved_jobs: 1 } : job
            )
            return page?.data?.result
              ? { ...page, data: { ...page.data, result: mapped } }
              : { ...page, result: mapped }
          })
        }
      })
    }

    // onSettled: () => {
    //   setSavingJobId(null);

    //   // Clean refetch
    //   queryClient.invalidateQueries({ queryKey: ["saved-jobs"] });
    //   queryClient.invalidateQueries({ queryKey: ["jobs"] });
    //   queryClient.invalidateQueries({ queryKey: ["recommended-jobs"] });
    // },
  })

  /* ===================== APPLY JOB MUTATION - OPTIMIZED ===================== */
  const applyJobMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await ensureValidToken()
      return applyJob({ id: jobId })
    },
    onMutate: async jobId => {
      setApplyingJobId(jobId)

      // Cancel ongoing fetches only for affected tabs
      await Promise.all([
        queryClient.cancelQueries({ queryKey: ['jobs'] }),
        queryClient.cancelQueries({ queryKey: ['applied-jobs'] })
      ])

      // Update applied-jobs query optimistically by adding the job
      queryClient.setQueryData(['applied-jobs'], (old: any) => {
        if (!old) return old
        const allJobsData = queryClient.getQueryData([
          'jobs',
          { search: urlSearchQuery }
        ]) as any
        const recommendedJobsData = queryClient.getQueryData([
          'recommended-jobs'
        ]) as any

        let jobToAdd = null

        if (allJobsData?.pages) {
          for (const page of allJobsData.pages) {
            const found = page?.data?.result?.find((j: any) => j.id === jobId)
            if (found) {
              jobToAdd = { ...found, applied_jobs: 1 }
              break
            }
          }
        }

        if (!jobToAdd && recommendedJobsData?.pages) {
          for (const page of recommendedJobsData.pages) {
            const found = page?.data?.result?.find((j: any) => j.id === jobId)
            if (found) {
              jobToAdd = { ...found, applied_jobs: 1 }
              break
            }
          }
        }

        if (jobToAdd && old.pages) {
          const newPages = [...old.pages]
          if (newPages[0]?.data?.result) {
            newPages[0] = {
              ...newPages[0],
              data: {
                ...newPages[0].data,
                result: [jobToAdd, ...newPages[0].data.result],
                total_count: (newPages[0].data.total_count || 0) + 1
              }
            }
          }
          return { ...old, pages: newPages }
        }
        return old
      })

      // Update jobs query optimistically(29th jan)
      const markAppliedOnly = (old: any) => {
        if (!old?.pages) return old

        return {
          ...old,
          pages: old.pages.map((page: any) => ({
            ...page,
            data: {
              ...page.data,
              result: page.data.result?.map((job: any) =>
                job.id === jobId ? { ...job, applied_jobs: 1 } : job
              )
            }
          }))
        }
      }

      const updateAppliedFlag = (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any, index: number) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, applied_jobs: 1 } : job
              )
              // Only increment count on first page
              // total_count: index === 0 ? (page.data.total_count || 0) + 1 : page.data.total_count
            }
          }
        })
        return { ...old, pages: newPages }
      }

      // Update applied flag optimistically for all jobs queries
      const jobsQueries = queryClient.getQueriesData({ queryKey: ['jobs'] })
      jobsQueries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, updateAppliedFlag)
        }
      })

      // queryClient.setQueryData(['applied-jobs'], updateAppliedFlag)
      // queryClient.setQueryData(['recommended-jobs'], updateAppliedFlag)
      // queryClient.setQueryData(['recommended-jobs-top'], updateAppliedFlag)

      // Mark applied flag ONLY (no count change) (29th jan)
      queryClient.setQueriesData({ queryKey: ['jobs'] }, markAppliedOnly)
      queryClient.setQueryData(['recommended-jobs'], markAppliedOnly)
      // queryClient.setQueryData(["recommended-jobs-top"], markAppliedOnly);

      queryClient.setQueryData(
        ['recommended-jobs-top', { limit: 3, page: 1 }],
        (old: any) => {
          if (!old?.data?.result) return old
          return {
            ...old,
            data: {
              ...old.data,
              result: old.data.result.map((job: any) =>
                job.id === jobId ? { ...job, applied_jobs: 1 } : job
              )
            }
          }
        }
      )

      return { jobId }
    },
    onSuccess: () => {
      toast.success('Job applied successfully!')
      setApplyingJobId(null)
      // Only refetch applied jobs tab
      queryClient.invalidateQueries({ queryKey: ['jobs', { tab: 'applied' }] })
      queryClient.invalidateQueries({ queryKey: ['applied-jobs'] })
      // toast.success("Job application submitted successfully!");
    },
    onError: (error: any, jobId) => {
      if (isUnauthenticatedError(error)) openGate('apply for this job')
      setApplyingJobId(null)
      // Revert optimistic updates
      const revertAppliedFlag = (old: any) => {
        if (!old?.pages) return old
        const newPages = old.pages.map((page: any) => {
          if (!page?.data?.result) return page
          return {
            ...page,
            data: {
              ...page.data,
              result: page.data.result.map((job: any) =>
                job.id === jobId ? { ...job, applied_jobs: 0 } : job
              )
            }
          }
        })
        return { ...old, pages: newPages }
      }

      const jobsQueries = queryClient.getQueriesData({ queryKey: ['jobs'] })
      jobsQueries.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData(queryKey, revertAppliedFlag)
        }
      })

      queryClient.setQueryData(['applied-jobs'], revertAppliedFlag)
      queryClient.setQueryData(['recommended-jobs'], revertAppliedFlag)
      // queryClient.setQueryData(["recommended-jobs-top"], revertAppliedFlag);

      queryClient.setQueryData(
        ['recommended-jobs-top', { limit: 3, page: 1 }],
        (old: any) => {
          if (!old?.data?.result) return old
          return {
            ...old,
            data: {
              ...old.data,
              result: old.data.result.map((job: any) =>
                job.id === jobId ? { ...job, applied_jobs: 0 } : job
              )
            }
          }
        }
      )

      toast.error(`Failed to apply for job: ${error.message}`)
    }

    // onSettled: () => {
    //   setApplyingJobId(null);

    //   // Refetch clean data instead of corrupting cache
    //   queryClient.invalidateQueries({ queryKey: ["applied-jobs"] });
    //   queryClient.invalidateQueries({ queryKey: ["jobs"] });
    //   queryClient.invalidateQueries({ queryKey: ["recommended-jobs"] });
    //   queryClient.invalidateQueries({ queryKey: ["recommended-jobs-top"] });
    // },
  })

  /* ---------------- FILTER LIST QUERY ---------------- */
  const { data: filterListData } = useQuery({
    queryKey: ['filter-list'],
    queryFn: fetchFilterList,
    enabled: true,
    staleTime: 1000 * 60 * 30, // 30 minutes instead of 5
    gcTime: 1000 * 60 * 60 // 1 hour cache
  })

  // console.log(
  //   'Filter List Data------------------------------>:',
  //   filterListData
  // )

  /* ---------------- ALL JOBS COUNT (unfiltered, for sidebar) ---------------- */
  const { data: allJobsCountData } = useQuery({
    queryKey: ['all-jobs-count'],
    queryFn: () => fetchJobs({ limit: 1, page: 1 }),
    staleTime: 1000 * 60 * 5,
    refetchOnMount: 'always',
  })

  /* ---------------- ALL JOBS WITH INFINITE SCROLL & SERVER SEARCH ---------------- */
  const {
    data: jobsData,
    isLoading: jobsLoading,
    error: jobsError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useInfiniteQuery({
    queryKey: [
      'jobs',
      {
        search: urlSearchQuery,
        filters: allTabFilters,
        sortBy: allTabSortBy,
      }
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchJobs({
        limit: 10,
        page: pageParam,
        search_text: urlSearchQuery,
        company_id: arrayToCommaSeparatedString(allTabFilters.company_id),
        job_sector_id: arrayToCommaSeparatedString(
          allTabFilters.jobsector
            .map(name => {
              const match = filterListData?.data?.jobsector?.find(
                (s: any) => (s.name ?? s) === name
              )
              return match?.id != null ? String(match.id) : null
            })
            .filter((id): id is string => Boolean(id))
        ),
        employment_type: arrayToCommaSeparatedString(
          allTabFilters.employment_type
            .map(label => {
              const match = filterListData?.data?.employment_type?.find(
                (et: any) => (et.label || et) === label
              )
              return match?.name ?? null
            })
            .filter((name): name is string => Boolean(name))
        ),
        job_location: arrayToCommaSeparatedString(allTabFilters.job_location),
        sort_by: allTabSortBy,
      }),
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = allPages.length
      const totalCount = lastPage?.data?.total_count || 0
      const totalPages = Math.ceil(totalCount / 10)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1
  })

  /* ---------------- RECOMMENDED JOBS WITH INFINITE SCROLL ---------------- */
  const {
    data: recommendedData,
    isLoading: recommendedLoading,
    hasNextPage: recommendedHasNextPage,
    fetchNextPage: recommendedFetchNextPage,
    isFetchingNextPage: recommendedIsFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['recommended-jobs'],
    // Recommendations are a soft-auth (public) read now — fetch for anonymous
    // visitors too, not only when signed in.
    enabled: true,
    queryFn: ({ pageParam = 1 }) =>
      fetchRecomendedJobs({ limit: 10, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = allPages.length
      const totalCount = pageTotalCount(lastPage)
      const totalPages = Math.ceil(totalCount / 10)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1
  })

  /* ---------------- SAVED JOBS WITH INFINITE SCROLL ---------------- */
  const {
    data: savedData,
    isLoading: savedLoading,
    hasNextPage: savedHasNextPage,
    fetchNextPage: savedFetchNextPage,
    isFetchingNextPage: savedIsFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['saved-jobs'],
    enabled: hasSession === true,
    queryFn: ({ pageParam = 1 }) =>
      fetchSavedJobs({ limit: 10, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = allPages.length
      const totalCount = pageTotalCount(lastPage)
      const totalPages = Math.ceil(totalCount / 10)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1
  })

  /* ---------------- APPLIED JOBS WITH INFINITE SCROLL ---------------- */
  const {
    data: appliedData,
    isLoading: appliedLoading,
    hasNextPage: appliedHasNextPage,
    fetchNextPage: appliedFetchNextPage,
    isFetchingNextPage: appliedIsFetchingNextPage
  } = useInfiniteQuery({
    queryKey: ['applied-jobs'],
    queryFn: ({ pageParam = 1 }) =>
      fetchAppliedJobs({ limit: 10, page: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      const currentPage = allPages.length
      const totalCount = pageTotalCount(lastPage)
      const totalPages = Math.ceil(totalCount / 10)
      return currentPage < totalPages ? currentPage + 1 : undefined
    },
    initialPageParam: 1,
    enabled: hasSession === true
  })

  // Recommended / Saved / Applied are filtered & sorted client-side, so the
  // visible list is only ever as complete as the pages already fetched. When
  // the user has an active search / filter / sort on one of these tabs, pull
  // every remaining page so the filter applies across the full dataset rather
  // than just the first page.
  const hasActiveClientFilters = useMemo(() => {
    const filtersActive =
      selectedFilters.company_id.length > 0 ||
      selectedFilters.jobsector.length > 0 ||
      selectedFilters.employment_type.length > 0 ||
      selectedFilters.job_location.length > 0
    const sortActive = sortBy && sortBy !== 'recently_added'
    const searchActive = clientSearchInput.trim().length > 0
    return Boolean(filtersActive || sortActive || searchActive)
  }, [selectedFilters, sortBy, clientSearchInput])

  useEffect(() => {
    if (!hasActiveClientFilters) return
    const currentTab = showAppliedJobs ? 'applied' : activeTab
    if (
      currentTab === 'recommended' &&
      recommendedHasNextPage &&
      !recommendedIsFetchingNextPage
    ) {
      recommendedFetchNextPage()
    } else if (
      currentTab === 'saved' &&
      savedHasNextPage &&
      !savedIsFetchingNextPage
    ) {
      savedFetchNextPage()
    } else if (
      currentTab === 'applied' &&
      appliedHasNextPage &&
      !appliedIsFetchingNextPage
    ) {
      appliedFetchNextPage()
    }
  }, [
    hasActiveClientFilters,
    activeTab,
    showAppliedJobs,
    recommendedHasNextPage,
    recommendedIsFetchingNextPage,
    recommendedFetchNextPage,
    savedHasNextPage,
    savedIsFetchingNextPage,
    savedFetchNextPage,
    appliedHasNextPage,
    appliedIsFetchingNextPage,
    appliedFetchNextPage,
  ])

  /* ---------------- TOP PICKS (LIMITED TO 3) ---------------- */
  const { data: topPicksData } = useQuery({
    queryKey: ['recommended-jobs-top', { limit: 3, page: 1 }],
    queryFn: () => fetchRecomendedJobs({ limit: 3, page: 1 }),
    // Soft-auth (public) read — works for anonymous visitors too.
    enabled: true,
    staleTime: 1000 * 60 * 5
  })

  /* ---------------- COMPUTE SAVED JOB IDS FROM SAVED DATA ---------------- */
  const savedJobIds = useMemo(() => {
    const ids = new Set<string>()
    if (savedData?.pages) {
      savedData.pages.forEach(page => {
        pageResult(page).forEach((job: any) => {
          ids.add(job.id)
        })
      })
    }
    return ids
  }, [savedData])

  /* ---------------- COMPUTE APPLIED JOB IDS FROM APPLIED DATA ---------------- */
  const appliedJobIds = useMemo(() => {
    const ids = new Set<string>()
    if (appliedData?.pages) {
      appliedData.pages.forEach(page => {
        pageResult(page).forEach((job: any) => {
          ids.add(job.id)
        })
      })
    }
    return ids
  }, [appliedData])

  /* ---------------- INTERSECTION OBSERVER FOR INFINITE SCROLL ---------------- */
  const observerTarget = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!observerTarget.current) return

    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          if (activeTab === 'all' && hasNextPage && !isFetchingNextPage) {
            fetchNextPage()
          } else if (
            activeTab === 'recommended' &&
            recommendedHasNextPage &&
            !recommendedIsFetchingNextPage
          ) {
            recommendedFetchNextPage()
          } else if (
            activeTab === 'saved' &&
            savedHasNextPage &&
            !savedIsFetchingNextPage
          ) {
            savedFetchNextPage()
          } else if (
            showAppliedJobs &&
            appliedHasNextPage &&
            !appliedIsFetchingNextPage
          ) {
            appliedFetchNextPage()
          }
        }
      },
      { threshold: 0, rootMargin: '0px 0px 200px 0px' }
    )

    observer.observe(observerTarget.current)
    return () => observer.disconnect()
    // NOTE: dep array intentionally lean — mirrors CompaniesList.tsx pattern.
    // We exclude isFetching* flags (they would re-attach the observer the
    // moment a fetch starts and re-fire intersection, causing a cascade) and
    // exclude data/count refs. The fetching flags are still read inside the
    // callback as guards via closure; they are stable enough because the
    // observer fires on intersection events, not on every render.
    // rootMargin kept at "0px 0px 200px 0px" (pre-fetch slightly before the
    // sentinel enters the viewport) instead of CompaniesList's "0px" — this
    // preserves the existing UX of JobListing's longer scroll content.
  }, [
    activeTab,
    hasNextPage,
    recommendedHasNextPage,
    savedHasNextPage,
    appliedHasNextPage,
    fetchNextPage,
    recommendedFetchNextPage,
    savedFetchNextPage,
    appliedFetchNextPage
  ])

  /* ---------------- BACK-NAV SCROLL RESTORATION ---------------- */
  // Returns the loaded-pages count for the currently-visible infinite query.
  // 'latest' isn't backed by its own query yet — fall back to allJobs.
  const getActivePagesCount = useCallback(() => {
    switch (activeTab) {
      case 'saved':
        return savedData?.pages?.length ?? 0
      case 'recommended':
        return recommendedData?.pages?.length ?? 0
      case 'latest':
        return jobsData?.pages?.length ?? 0
      case 'all':
      default:
        return jobsData?.pages?.length ?? 0
    }
  }, [activeTab, jobsData, savedData, recommendedData])

  // CV gate now lives on the Job Details page (where applying happens). The
  // modal is kept mounted but is no longer triggered from the listing.
  const { gateModal: applyGateModal } = useApplyGate()
  const { ensureAuthed, openGate, gateModal: authGateModal } = useAuthGate()

  // Save scroll + active tab + loaded pages before navigating to a job detail.
  const navigateToJob = useCallback(
    (jobId: string) => {
      saveBeforeNavigate()
      router.push(`/jobs/${jobId}`)
    },
    [router, saveBeforeNavigate]
  )

  // MOVE THIS ABOVE all useMemo hooks
  const filterJobsClientSide = (
    jobs: any[],
    searchText: string,
    filters: typeof selectedFilters
  ) => {
    const searchLower = searchText.toLowerCase()

    return jobs.filter(job => {
      const matchesSearch =
        !searchText ||
        searchText.length <= 2 ||
        job.title?.toLowerCase().includes(searchLower) ||
        job.company_name?.toLowerCase().includes(searchLower) ||
        job.job_sector?.toLowerCase().includes(searchLower) ||
        job.location?.some((loc: string) =>
          loc.toLowerCase().includes(searchLower)
        )

      const matchesCompany =
        !filters.company_id.length ||
        filters.company_id.includes(String(job.company_id))

      const matchesSector =
        !filters.jobsector.length || filters.jobsector.includes(job.job_sector)

      // const matchesEmploymentType =
      //   !filters.employment_type.length ||
      //   filters.employment_type.includes(job.employment_type);

      const matchesEmploymentType =
        !filters.employment_type.length ||
        filters.employment_type.some(
          selectedType => selectedType === job.employment_type
        )

      const matchesLocation =
        !filters.job_location.length ||
        job.location?.some((loc: string) => filters.job_location.includes(loc))

      return (
        matchesSearch &&
        matchesCompany &&
        matchesSector &&
        matchesEmploymentType &&
        matchesLocation
      )
    })
  }

  /* ---------------- DATA PROCESSING WITH CLIENT-SIDE FILTERING ---------------- */
  const user = userProfile?.data

  const allJobs =
    jobsData?.pages.flatMap(page => page?.data?.result || []) || []
  const totalAllJobs = jobsData?.pages[0]?.data?.total_count || 0
  // Sidebar "All Jobs (n)" reflects the *current* filter / search / sort
  // result. Fall back to the unfiltered count only before the filtered query
  // has produced any pages.
  const hasFilteredPages = (jobsData?.pages?.length ?? 0) > 0
  const sidebarAllJobsCount = hasFilteredPages
    ? totalAllJobs
    : allJobsCountData?.data?.total_count ?? 0

  const allRecommendedJobs =
    recommendedData?.pages.flatMap(page => pageResult(page)) || []
  const totalRecommendedJobs = pageTotalCount(recommendedData?.pages[0])

  const filteredRecommendedJobs = useMemo(() => {
    return filterJobsClientSide(
      allRecommendedJobs,
      clientSearchInput,
      selectedFilters
    )
  }, [allRecommendedJobs, clientSearchInput, selectedFilters])

  const allSavedJobs =
    savedData?.pages.flatMap(page => pageResult(page)) || []
  const totalSavedJobs = pageTotalCount(savedData?.pages[0])

  const filteredSavedJobs = useMemo(() => {
    return filterJobsClientSide(
      allSavedJobs,
      clientSearchInput,
      selectedFilters
    )
  }, [allSavedJobs, clientSearchInput, selectedFilters])

  /* ---------------- APPLIED JOBS FILTERING ---------------- */
  const allAppliedJobs =
    appliedData?.pages.flatMap(page => pageResult(page)) || []
  const totalAppliedJobs = pageTotalCount(appliedData?.pages?.[0])

  const filteredAppliedJobs = useMemo(() => {
    return filterJobsClientSide(
      allAppliedJobs,
      clientSearchInput,
      selectedFilters
    )
  }, [allAppliedJobs, clientSearchInput, selectedFilters])

  const allTopPicksJobs = pageResult(topPicksData)

  const filteredTopPicksJobs = useMemo(() => {
    const searchQuery = activeTab === 'all' ? urlSearchQuery : clientSearchInput

    if (!searchQuery || searchQuery.length < 2) {
      return allTopPicksJobs
    }

    const searchLower = searchQuery.toLowerCase()
    return allTopPicksJobs.filter((job: any) => {
      return (
        job.title?.toLowerCase().includes(searchLower) ||
        job.company_name?.toLowerCase().includes(searchLower) ||
        job.location?.some((loc: string) =>
          loc.toLowerCase().includes(searchLower)
        ) ||
        job.job_sector?.toLowerCase().includes(searchLower)
      )
    })
  }, [allTopPicksJobs, urlSearchQuery, clientSearchInput, activeTab])

  // Top picks sidebar is always unfiltered
  // const filteredTopPicksJobs = useMemo(() => {
  //   return allTopPicksJobs;
  // }, [allTopPicksJobs]);

  const isLoadingMainContent =
    (activeTab === 'all' && jobsLoading) ||
    (activeTab === 'recommended' && recommendedLoading) ||
    (activeTab === 'saved' && savedLoading) ||
    (showAppliedJobs && appliedLoading)

  const rawCurrentJobs = showAppliedJobs
    ? filteredAppliedJobs
    : activeTab === 'all'
    ? allJobs
    : activeTab === 'recommended'
    ? filteredRecommendedJobs
    : activeTab === 'saved'
    ? filteredSavedJobs
    : []

  // Client-side sort for non-'all' tabs ('all' is server-sorted by API).
  const currentJobs = React.useMemo(() => {
    const list = Array.isArray(rawCurrentJobs) ? [...rawCurrentJobs] : []
    if (sortBy === 'a_to_z') {
      list.sort((a: any, b: any) => (a.title || '').localeCompare(b.title || ''))
    } else if (sortBy === 'z_to_a') {
      list.sort((a: any, b: any) => (b.title || '').localeCompare(a.title || ''))
    } else if (sortBy === 'recently_added') {
      list.sort((a: any, b: any) => {
        const ad = new Date(a.created_at || 0).getTime()
        const bd = new Date(b.created_at || 0).getTime()
        return bd - ad
      })
    }
    return list
  }, [rawCurrentJobs, sortBy, activeTab, showAppliedJobs])

  const totalJobs = showAppliedJobs
    ? totalAppliedJobs
    : activeTab === 'all'
    ? totalAllJobs
    : activeTab === 'recommended'
    ? totalRecommendedJobs
    : activeTab === 'saved'
    ? totalSavedJobs
    : 0

  const isFetching = showAppliedJobs
    ? appliedIsFetchingNextPage
    : activeTab === 'all'
    ? isFetchingNextPage
    : activeTab === 'recommended'
    ? recommendedIsFetchingNextPage
    : activeTab === 'saved'
    ? savedIsFetchingNextPage
    : false

  const hasMore = showAppliedJobs
    ? appliedHasNextPage
    : activeTab === 'all'
    ? hasNextPage
    : activeTab === 'recommended'
    ? recommendedHasNextPage
    : activeTab === 'saved'
    ? savedHasNextPage
    : false

  const currentSearchQuery =
    activeTab === 'all' ? urlSearchQuery : clientSearchInput

  /* ---------------- HANDLERS ---------------- */

  const handleTabChange = (tab: TabType) => {
    const emptyFilters = {
      company_id: [],
      jobsector: [],
      employment_type: [],
      job_location: []
    }

    setServerSearchInput('')
    setClientSearchInput('')
    setShowAppliedJobs(false) // Reset applied jobs toggle when switching tabs

    setSelectedFilters(emptyFilters)
    setSortBy('recently_added')

    // Also reset the All-tab server-query snapshot so the sidebar count and
    // list refetch unfiltered on the next All-tab visit. Without this the
    // snapshot would still hold the prior filters/sort and the user would
    // see the old filtered count even though the filter UI is cleared.
    setAllTabFilters(emptyFilters)
    setAllTabSortBy('recently_added')

    if (urlSearchQuery) {
      router.push(currentPathname, { scroll: false })
    }

    queryClient.invalidateQueries({ queryKey: ['jobs'] })

    setActiveTab(tab)
  }

  // NOTE: previously this effect cancelled the ['jobs'] query whenever
  // activeTab !== 'all'. On hard-refresh from a non-'all' tab, the persisted
  // activeTab caused the cancel to fire before the in-flight request returned,
  // leaving the sidebar's "All Jobs (count)" stuck at 0 until the user clicked
  // the All Jobs tab. We need the count regardless of which tab is active, so
  // the cancel has been removed.

  const handleFilterChange = (
    filterType: keyof typeof selectedFilters,
    values: string[]
  ) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterType]: values
    }))
  }

  const clearAllFilters = () => {
    setSelectedFilters({
      company_id: [],
      jobsector: [],
      employment_type: [],
      job_location: []
    })

    setServerSearchInput('')
    setClientSearchInput('')
    setSortBy('recently_added')

    if (urlSearchQuery) {
      router.push(currentPathname, { scroll: false })
    }

    queryClient.invalidateQueries({ queryKey: ['jobs'], exact: false })
  }

  const hasAnyFilterSelected = () => {
    return (
      Object.values(selectedFilters).some(filter => filter.length > 0) ||
      sortBy !== 'recently_added'
    )
  }

  const handleSaveJob = (jobId: string, alreadySaved?: boolean) => {
    // A job is "saved" if it's in the saved-jobs cache OR the job row itself
    // carries saved_jobs === '1' / 1 (the listing endpoints embed this flag).
    // We can't rely solely on savedJobIds because that set is built from the
    // saved-jobs query, which may not yet be populated on the All / Recommended
    // / Applied tabs.
    const isSaved = alreadySaved ?? savedJobIds.has(jobId)
    ensureAuthed('save this job', () => {
      if (isSaved) {
        // Unsave immediately — no confirmation needed.
        unsaveJobMutation.mutate(jobId)
      } else {
        saveJobMutation.mutate(jobId)
      }
    })
  }

  const handleApplyJob = (job: any) => {
    // Applying now happens only on a job's own Details page. From the listing
    // we just open that page; the CV gate + apply live inside Job Details.
    navigateToJob(job.id)
  }

  const confirmApplyJob = () => {
    if (!applyConfirmModal) return
    applyJobMutation.mutate(applyConfirmModal.jobId)
    setApplyConfirmModal(null)
  }

  const cancelApplyJob = () => {
    setApplyConfirmModal(null)
  }

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value

    if (activeTab === 'all' && !showAppliedJobs) {
      setServerSearchInput(value)
      setIsSearching(value.length >= 2)
    } else {
      setClientSearchInput(value)
    }
  }
  const handleClearSearch = () => {
    setIsSearching(false)

    if (activeTab === 'all') {
      setServerSearchInput('') // FIX
      setClientSearchInput('') // safety

      if (urlSearchQuery) {
        router.replace(currentPathname, { scroll: false })
      }

      return
    }

    setClientSearchInput('')
  }

  const handleAppliedJobsToggle = (e: React.ChangeEvent<HTMLInputElement>) => {
    setShowAppliedJobs(e.target.checked)
  }

  const handleCompanyClick = (companyId: any) => {
    if (!companyId) return

    router.push(`/company/${companyId}`)

    // optional: scroll to top after navigation
    // window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /* ---------------- SAFE EARLY RETURNS ---------------- */
  if (userProfileLoading) {
    return <div className='text-white'></div>
  }

  // if (jobsError) {
  //   return <div className='text-white'>Failed to load jobs</div>
  // }

  const displaySearchInput =
    activeTab === 'all' && !showAppliedJobs
      ? serverSearchInput
      : clientSearchInput

  return (
    <div className='container mx-auto px-4'>
      <div
        className={`${styles.jobListing_main_section_wrapper} max-content-height`}
      >
        <div
          className='flex flex-wrap gap-y-4 -mx-2 mt-6'
          style={{ height: '100%' }}
        >
          {/* Sidebar */}
          <div
            className={`full-width-midium col-lg-4 `}
            style={{ height: '100%' }}
          >
            <aside className={styles.sidebar_main_section}>
              {/* Profile Card */}
              <ProfileCardsmall />

              {/* Navigation */}
              <div className={`${styles.side_job_navigation} order-2 lg:order-1`}>
                {isLoadingMainContent ? (
                  <>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{ width: `${45 + i * 8}%`, height: 14, borderRadius: 6, background: isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)', animation: 'sidebarPulse 1.5s ease-in-out infinite' }} />
                    ))}
                    <style>{`@keyframes sidebarPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
                  </>
                ) : (
                <>
                <button
                  onClick={() => handleTabChange('all')}
                  className={` ${styles.side_job_navigation_btn} ${
                    activeTab === 'all' && !showAppliedJobs ? styles.active : ''
                  }`}
                  style={
                    isLight
                      ? activeTab === 'all' && !showAppliedJobs
                        ? { fontWeight: 600, color: '#040F1F' }
                        : { color: '#888888' }
                      : undefined
                  }
                >
                  <span className='inline-flex items-center gap-2'>
                    {/* Ionicons briefcase (same glyph as the top nav) rather
                        than lucide's, which reads as a plain rounded box. */}
                    <BriefcaseIcon
                      width={16}
                      height={16}
                      className='shrink-0'
                      filled={activeTab === 'all' && !showAppliedJobs}
                    />
                    All Jobs ({sidebarAllJobsCount})
                  </span>
                </button>
                 <button
                  onClick={() => handleTabChange('saved')}
                  className={` ${styles.side_job_navigation_btn} ${
                    activeTab === 'saved' && !showAppliedJobs
                      ? styles.active
                      : ''
                  }`}
                  style={
                    isLight
                      ? activeTab === 'saved' && !showAppliedJobs
                        ? { fontWeight: 600, color: '#040F1F' }
                        : { color: '#888888' }
                      : undefined
                  }
                >
                  <span className='inline-flex items-center gap-2'>
                    <TabIcon
                      icon={Bookmark}
                      active={activeTab === 'saved' && !showAppliedJobs}
                    />
                    Saved ({totalSavedJobs})
                  </span>
                </button>
                   <button
                  onClick={() => handleTabChange('recommended')}
                  className={` ${styles.side_job_navigation_btn} ${
                    activeTab === 'recommended' && !showAppliedJobs
                      ? styles.active
                      : ''
                  }`}
                  style={
                    isLight
                      ? activeTab === 'recommended' && !showAppliedJobs
                        ? { fontWeight: 600, color: '#040F1F' }
                        : { color: '#888888' }
                      : undefined
                  }
                >
                  <span className='inline-flex items-center gap-1.5'>
                    <TabIcon
                      icon={Star}
                      active={activeTab === 'recommended' && !showAppliedJobs}
                    />
                    <span className='ml-0.5'>
                      Recommended ({totalRecommendedJobs})
                    </span>
                    <RecommendedInfoTooltip />
                  </span>
                </button>
                <button
                  onClick={() => {
                    setShowAppliedJobs(true)
                    setActiveTab('all') // Reset active tab to avoid conflicts
                    setSelectedFilters({
                      company_id: [],
                      jobsector: [],
                      employment_type: [],
                      job_location: []
                    })
                    setServerSearchInput('')
                    setClientSearchInput('')
                  }}
                  className={` ${styles.side_job_navigation_btn} ${
                    showAppliedJobs ? styles.active : ''
                  }`}
                  style={
                    isLight
                      ? showAppliedJobs
                        ? { fontWeight: 600, color: '#040F1F' }
                        : { color: '#888888' }
                      : undefined
                  }
                >
                  <span className='inline-flex items-center gap-2'>
                    <TabIcon
                      icon={CircleCheck}
                      active={showAppliedJobs}
                      knockout={isLight ? '#FFFFFF' : '#040F1F'}
                    />
                    Applied ({totalAppliedJobs})
                  </span>
                </button>
                </>
                )}
               
             
                {/* <Tooltip title='Coming soon'>
                  <button
                    className={` ${styles.side_job_navigation_btn} ${
                      activeTab === 'latest' ? '' : ''
                    }`}
                  >
                    Latest ({0})
                  </button>
                </Tooltip> */}
              </div>

              {/* Recommended Jobs Section */}
              {/* <div className={`${styles.side_recomended_job} order-1 lg:order-2`}>
                <h4
                  className='font-semibold mb-4'
                  style={isLight ? { color: '#040F1F' } : undefined}
                >
                  Recommended Jobs
                </h4>
                {filteredTopPicksJobs?.length === 0 ? (
                  <p
                    className='text-sm text-slate-400'
                    style={isLight ? { color: '#888888' } : undefined}
                  >
                    No recommended jobs found.
                  </p>
                ) : (
                  <div className={styles.side_recomended_job_list_wrapper}>
                    {filteredTopPicksJobs.map((job: any) => (
                      <div
                        key={job.id}
                        className={`${styles.side_recomended_job_item} card-hover`}
                        onClick={() => navigateToJob(job.id)}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className={styles.side_recomended_job_information}>
                          <div className={styles.side_recomended_job_item_logo}>
                            <LogoWithFallback
                              src={job?.company_logo_url}
                              name={job?.company_name || job?.title || ''}
                              size={88}
                              borderRadius={12}
                              alt={`Company Logo`}
                              imgClassName={styles.side_recomended_job_item_logo_img}
                            />
                          </div>
                          <div className={styles.side_recomended_job_item_info}>
                            <p
                              className={
                                styles.side_recomended_job_item_info_title
                              }
                              style={isLight ? { color: '#040F1F' } : undefined}
                            >
                              {job.title}
                            </p>
                            <p
                              className={
                                styles.side_recomended_job_item_info_company
                              }
                              style={isLight ? { color: '#888888' } : undefined}
                            >
                              {job.company_name}
                            </p>
                            {job.location?.length ? (
                              <div className={styles.jobListing_job_item_location_row}>
                                <JobLocations
                                  locations={job.location}
                                  isLight={isLight}
                                  title={job.title}
                                />
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className={styles.side_recomended_job_item_btns}>
                          {job?.applied_jobs != 1 ? (
                            <button
                              className={
                                isLight
                                  ? 'light-apply-btn'
                                  : `${mainstyles.jobDetails_job_item_btns} btn-gradient`
                              }
                              onClick={e => {
                                e.stopPropagation()
                                handleApplyJob(job)
                              }}
                            >
                              View Job
                            </button>
                          ) : (
                            <button
                              className={isLight ? 'light-applied-btn' : `${mainstyles.jobDetails_job_item_btns} btn-gradient apply-btn`}
                              onClick={e => {
                                e.stopPropagation()
                                handleApplyJob(job)
                              }}
                              disabled={true}
                            >
                              Applied
                            </button>
                          )}

                          <button
                            onClick={e => {
                              e.stopPropagation()
                              handleSaveJob(
                                job.id,
                                savedJobIds.has(job.id) ||
                                  job?.saved_jobs == 1,
                              )
                            }}
                            disabled={savingJobId === job.id || unsavingJobId === job.id}
                            className={
                              isLight
                                ? 'light-save-btn'
                                : `${mainstyles.jobDetails_job_item_btns}
                              social-media-btn gradient-border-btn
                              ${
                                savedJobIds.has(job.id) ||
                                job?.saved_jobs == 1
                                  ? styles.activeactive
                                  : ''
                              }
                            `
                            }
                          >
                            {savingJobId === job.id
                              ? 'Saving...'
                              : unsavingJobId === job.id
                              ? 'Removing...'
                              : savedJobIds.has(job.id) || job?.saved_jobs == 1
                              ? 'Remove'
                              : 'Save'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div> */}
            </aside>
          </div>

          <div className={`full-width-midium col-lg-8 `}>
            <main className={styles.jobListing_main_section}>
              <div className={styles.jobListing_job_list_header}>
                <div className='col-lg-6 '>
                  <div className={styles.jobListing_job_list_header_left}>
                    <h1
                      className={styles.jobListing_main_section_title}
                      style={isLight ? { color: '#040F1F' } : undefined}
                      // Title text derives from the active tab, which is restored
                      // from sessionStorage on the client (client-only) — differs
                      // from the SSR default. Recoverable; suppress the warning.
                      suppressHydrationWarning
                    >
                      {showAppliedJobs && `Applied Jobs `}
                      {!showAppliedJobs && activeTab === 'all' && `All Jobs `}
                      {!showAppliedJobs &&
                        activeTab === 'saved' &&
                        `Saved Jobs `}
                      {!showAppliedJobs &&
                        activeTab === 'recommended' &&
                        `Recommended `}
                      {/* {currentSearchQuery &&
                        currentSearchQuery.length >= 2 &&
                        `- Results for "${currentSearchQuery}"`} */}
                    </h1>
                  </div>
                </div>
                <div className='col-lg-6 search-flex'>
                  <div className={styleSheet.search_panel_area}>
                    <form
                      onSubmit={handleSearch}
                      className={styleSheet.search_form}
                    >
                      <span className={styleSheet.search_icon}>
                        <svg
                          xmlns='http://www.w3.org/2000/svg'
                          width={20}
                          height={20}
                          viewBox='0 0 22 22'
                          fill='none'
                        >
                          <path
                            d='M8.34049 13.6818C6.84426 13.6818 5.57716 13.1629 4.53918 12.125C3.50134 11.0871 2.98242 9.81996 2.98242 8.32373C2.98242 6.82751 3.50134 5.5604 4.53918 4.52242C5.57716 3.48459 6.84426 2.96567 8.34049 2.96567C9.83671 2.96567 11.1038 3.48459 12.1418 4.52242C13.1796 5.5604 13.6986 6.82751 13.6986 8.32373C13.6986 8.94947 13.5936 9.5471 13.3836 10.1166C13.1734 10.6861 12.8931 11.1815 12.5426 11.6026L17.5842 16.6442C17.7055 16.7654 17.7676 16.9178 17.7704 17.1015C17.7732 17.2852 17.7111 17.4405 17.5842 17.5674C17.4573 17.6943 17.3034 17.7578 17.1224 17.7578C16.9417 17.7578 16.7878 17.6943 16.6609 17.5674L11.6194 12.5259C11.1813 12.8876 10.6775 13.1707 10.108 13.3751C9.53844 13.5796 8.94929 13.6818 8.34049 13.6818ZM8.34049 12.3677C9.46944 12.3677 10.4257 11.9759 11.2091 11.1923C11.9927 10.4089 12.3845 9.45269 12.3845 8.32373C12.3845 7.19477 11.9927 6.23857 11.2091 5.45512C10.4257 4.67152 9.46944 4.27972 8.34049 4.27972C7.21153 4.27972 6.25532 4.67152 5.47187 5.45512C4.68827 6.23857 4.29647 7.19477 4.29647 8.32373C4.29647 9.45269 4.68827 10.4089 5.47187 11.1923C6.25532 11.9759 7.21153 12.3677 8.34049 12.3677Z'
                            fill='#E3E3E3'
                          />
                        </svg>
                      </span>
                      <input
                        type='text'
                        placeholder='Search'
                        value={displaySearchInput}
                        onChange={handleInputChange}
                        className={styleSheet.search_panel}
                        suppressHydrationWarning
                      />
                      {activeTab === 'all' &&
                      isSearching &&
                      serverSearchInput.length > 0 && // ADD THIS
                      debouncedServerSearch !== serverSearchInput ? (
                        <span className={styleSheet.searching_indicator}>
                          <span className='inline-block'>
                            <LoaderCircle className='w-4 h-4 mt-[-3px] text-white animate-spin' />
                          </span>
                        </span>
                      ) : (
                        displaySearchInput && (
                          <button
                            type='button'
                            onClick={handleClearSearch}
                            className={styleSheet.clear_search_button}
                            aria-label='Clear search'
                          >
                            <X className='w-4 h-4 cursor-pointer mt-[-3px]' />
                          </button>
                        )
                      )}

                      <span
                        className={styleSheet.search_panel_filter_icon}
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" height={20} width={20} viewBox="0 0 640 640"  style={{transform: "rotate(180deg)", fill: isLight? "#000": "#fff"}} ><path d="M352 96C334.3 96 320 110.3 320 128C320 145.7 334.3 160 352 160L384 160C401.7 160 416 145.7 416 128C416 110.3 401.7 96 384 96L352 96zM352 224C334.3 224 320 238.3 320 256C320 273.7 334.3 288 352 288L448 288C465.7 288 480 273.7 480 256C480 238.3 465.7 224 448 224L352 224zM352 352C334.3 352 320 366.3 320 384C320 401.7 334.3 416 352 416L512 416C529.7 416 544 401.7 544 384C544 366.3 529.7 352 512 352L352 352zM352 480C334.3 480 320 494.3 320 512C320 529.7 334.3 544 352 544L576 544C593.7 544 608 529.7 608 512C608 494.3 593.7 480 576 480L352 480zM182.6 105.4C170.1 92.9 149.8 92.9 137.3 105.4L41.3 201.4C28.8 213.9 28.8 234.2 41.3 246.7C53.8 259.2 74.1 259.2 86.6 246.7L128 205.3L128 512C128 529.7 142.3 544 160 544C177.7 544 192 529.7 192 512L192 205.3L233.4 246.7C245.9 259.2 266.2 259.2 278.7 246.7C291.2 234.2 291.2 213.9 278.7 201.4L182.7 105.4z" /></svg>
                      </span>
                    </form>
                    {activeTab !== 'all' &&
                      displaySearchInput.length > 0 &&
                      displaySearchInput.length < 2 && (
                        <div className='text-xs text-gray-400 mt-1'>
                          Type at least 2 characters to search
                        </div>
                      )}
                  </div>
                  {isFilterOpen && hasAnyFilterSelected() && (
                    <button
                      onClick={() => {
                        clearAllFilters()
                        setIsFilterOpen(false)
                      }}
                      className={styleSheet.clear_filters_button}
                      style={isLight ? { color: '#040F1F' } : undefined}
                    >
                      Clear All
                    </button>
                  )}
                </div>
                <div className='col-lg-12'>
                  <div
                    className={`${styleSheet.filter_section} ${
                      isFilterOpen
                        ? styleSheet.filter_section_open
                        : styleSheet.filter_section_closed
                    }`}
                  >
                    {/* Filter button + inline Sort chip */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <FilterSortTrigger
                        count={
                          (selectedFilters.job_location.length > 0 ? 1 : 0) +
                          (selectedFilters.jobsector.length > 0 ? 1 : 0) +
                          (selectedFilters.company_id.length > 0 ? 1 : 0) +
                          (selectedFilters.employment_type.length > 0 ? 1 : 0)
                        }
                        onClick={() => setShowFiltersModal(true)}
                      />
                      <SortByPills
                        groups={DEFAULT_SORT_GROUPS}
                        value={sortBy}
                        onChange={setSortBy}
                      />
                    </div>
                    <FilterSortModal
                      open={showFiltersModal}
                      onClose={() => setShowFiltersModal(false)}
                      defaultSortValue='recently_added'
                      filters={[
                        {
                          key: 'job_location',
                          title: 'Location',
                          options: Array.isArray(filterListData?.data?.job_location)
                            ? filterListData.data.job_location.map((job_location: any) => ({
                                label: job_location.name || job_location,
                                value: job_location.name || job_location,
                                count: job_location.count,
                              }))
                            : [],
                          selectedValues: selectedFilters.job_location,
                          onChange: values => handleFilterChange('job_location', values),
                        },
                        {
                          key: 'company_id',
                          title: 'Company',
                          options: Array.isArray(filterListData?.data?.company)
                            ? filterListData.data.company.map((company: any) => ({
                                label: company.name || company,
                                value: String(company.id ?? company),
                                count: company.count,
                              }))
                            : [],
                          selectedValues: selectedFilters.company_id,
                          onChange: values => handleFilterChange('company_id', values),
                        },
                        {
                          key: 'jobsector',
                          title: 'Job Sector',
                          options: Array.isArray(filterListData?.data?.jobsector)
                            ? filterListData.data.jobsector.map((sector: any) => ({
                                label: sector.name || sector,
                                value: sector.name || sector,
                                count: sector.count,
                              }))
                            : [],
                          selectedValues: selectedFilters.jobsector,
                          onChange: values => handleFilterChange('jobsector', values),
                        },
                        {
                          key: 'employment_type',
                          title: 'Employment Type',
                          options: Array.isArray(filterListData?.data?.employment_type)
                            ? filterListData.data.employment_type.map((employment_type: any) => ({
                                label: employment_type.label || employment_type,
                                value: employment_type.label || employment_type,
                                count: employment_type.count,
                              }))
                            : [],
                          selectedValues: selectedFilters.employment_type,
                          onChange: values => handleFilterChange('employment_type', values),
                        },
                      ] as FilterSection[]}
                    />

                    {/* <div className={styleSheet.filter_actions}>
                    
                    <button
                      onClick={() => setIsFilterOpen(false)}
                      className={styleSheet.apply_filters_button}
                    >
                      Apply Filters
                    </button> */}
                    {/* </div> */}
                  </div>
                </div>
              </div>

              {isLoadingMainContent ? (
                <div className={styles.jobListing_job_list} ref={setScrollContainer}>
                  <JobCardSkeleton />
                  <JobCardSkeleton />
                  <JobCardSkeleton />
                </div>
              ) : (
                <>
                  <div className={styles.jobListing_job_list} ref={setScrollContainer}>
                    {currentJobs.length > 0 ? (
                      currentJobs.map((job: any, index: number) => (
                        <div
                          key={job.id}
                          className={`${styles.jobListing_job_item} ${styles.jobListing_job_item_animated} card-hover`}
                          onClick={() => navigateToJob(job.id)}
                          style={{
                            cursor: 'pointer',
                            animationDelay: `${Math.min(index, 12) * 55}ms`,
                          }}
                        >
                          <div className={styles.jobListing_card_main}>
                            {/* Row 1: circle logo | title + company | save */}
                            <div className={styles.jobListing_job_item_header}>
                              <div
                                className={styles.jobListing_card_logo}
                                onClick={e => {
                                  e.stopPropagation()
                                  handleCompanyClick(job?.company_id)
                                }}
                              >
                                <LogoWithFallback
                                  src={job?.company_logo_url}
                                  name={job?.company_name || job?.title || ''}
                                  size={64}
                                  borderRadius={14}
                                  alt={`${job.company_name} logo`}
                                  imgClassName={styles.jobListing_job_item_logo_img}
                                />
                              </div>

                              {/* Title → company → location, stacked beside the logo */}
                              <div className={styles.jobListing_job_item_headtext}>
                                <h3
                                  className={styles.jobListing_job_item_title}
                                  style={
                                    isLight ? { color: '#040F1F' } : undefined
                                  }
                                >
                                  {job.title}
                                </h3>
                                <p
                                  className={`${styles.jobListing_job_item_company} ${styles.jobListing_job_item_company_link}`}
                                  // No light-mode grey override here: the
                                  // company name keeps the brand violet in both
                                  // themes so it always reads as a link.
                                  onClick={e => {
                                    e.stopPropagation()
                                    handleCompanyClick(job?.company_id)
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
                                {job.location?.length ? (
                                  <div
                                    className={styles.jobListing_job_item_location_row}
                                  >
                                    <JobLocations
                                      locations={job.location}
                                      isLight={isLight}
                                      title={job.title}
                                    />
                                  </div>
                                ) : null}
                              </div>

                              {/* Save (bookmark icon) */}
                              {(() => {
                                const isSaved =
                                  savedJobIds.has(job.id) || job?.saved_jobs == 1
                                const isBusy =
                                  savingJobId === job.id ||
                                  unsavingJobId === job.id
                                return (
                                  <button
                                    type='button'
                                    onClick={e => {
                                      e.stopPropagation()
                                      handleSaveJob(job.id, isSaved)
                                    }}
                                    disabled={isBusy}
                                    aria-label={
                                      isSaved ? 'Remove from saved' : 'Save job'
                                    }
                                    title={isSaved ? 'Saved' : 'Save job'}
                                    className={`${styles.jobListing_bookmark_btn} ${
                                      isSaved ? styles.jobListing_bookmark_active : ''
                                    }`}
                                  >
                                    {isBusy ? (
                                      <LoaderCircle
                                        className={styles.jobListing_spin}
                                      />
                                    ) : (
                                      <Bookmark
                                        fill={isSaved ? 'currentColor' : 'none'}
                                      />
                                    )}
                                  </button>
                                )
                              })()}
                            </div>

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
                            {getJobShortDescription(job) && (
                              <p
                                className={styles.jobListing_job_item_desc}
                                style={isLight ? { color: '#555' } : undefined}
                              >
                                {getJobShortDescription(job)}
                              </p>
                            )}

                            {/* Row 4: job sector + View Job button */}
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
                                className={styles.jobListing_view_details}
                                onClick={e => {
                                  e.stopPropagation()
                                  handleApplyJob(job)
                                }}
                              >
                                View details
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
                      ))
                    ) : (
                      <div
                        className='text-center'
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '2px',
                          padding: '20px 0',
                          minHeight: '60vh',
                          width: '100%',
                        }}
                      >
                        <span className='text-center'>
                          <svg
                            style={{ margin: '0 auto' }}
                            xmlns='http://www.w3.org/2000/svg'
                            width={24}
                            height={24}
                            viewBox='0 0 130 130'
                            fill='none'
                          >
                            <path
                              d='M125.938 44.6875C125.933 40.3792 124.219 36.2487 121.173 33.2022C118.126 30.1558 113.996 28.4422 109.688 28.4375H97.5V24.375C97.4966 21.1437 96.2115 18.0457 93.9267 15.7608C91.6418 13.476 88.5438 12.1909 85.3125 12.1875H44.6875C41.4562 12.1909 38.3582 13.476 36.0733 15.7608C33.7885 18.0457 32.5034 21.1437 32.5 24.375V28.4375H20.3125C16.0042 28.4422 11.8737 30.1558 8.82721 33.2022C5.78076 36.2487 4.0672 40.3792 4.0625 44.6875V56.875H125.938V44.6875ZM89.375 28.4375H40.625V24.375C40.625 23.2976 41.053 22.2642 41.8149 21.5024C42.5767 20.7405 43.6101 20.3125 44.6875 20.3125H85.3125C86.3899 20.3125 87.4233 20.7405 88.1851 21.5024C88.947 22.2642 89.375 23.2976 89.375 24.375V28.4375ZM85.3125 67.0312C85.3125 68.6474 84.6705 70.1974 83.5277 71.3402C82.3849 72.483 80.8349 73.125 79.2188 73.125H50.7812C49.1651 73.125 47.6151 72.483 46.4723 71.3402C45.3295 70.1974 44.6875 68.6474 44.6875 67.0312V66.0156C44.6875 65.7463 44.5805 65.4879 44.39 65.2975C44.1996 65.107 43.9412 65 43.6719 65H4.0625V101.562C4.0625 105.872 5.77455 110.006 8.82201 113.053C11.8695 116.1 16.0027 117.812 20.3125 117.812H109.688C113.997 117.812 118.131 116.1 121.178 113.053C124.225 110.006 125.938 105.872 125.938 101.562V65H86.3281C86.0588 65 85.8004 65.107 85.61 65.2975C85.4195 65.4879 85.3125 65.7463 85.3125 66.0156V67.0312Z'
                              fill={isLight ? '#888' : '#A0A0A0'}
                            />
                          </svg>
                        </span>
                        <p style={{ color: isLight ? '#040F1F' : 'rgb(144 161 185)', margin: 0, fontWeight: '600' }}>
                          No jobs found
                        </p>
                        <p style={{ color: isLight ? '#555' : 'rgb(144 161 185)', margin: 0, fontSize: '12px' }}>
                          Try adjusting your search or filters
                        </p>
                      </div>
                    )}
                     {((activeTab === 'all' && hasNextPage) ||
                    (activeTab === 'recommended' && recommendedHasNextPage) ||
                    (activeTab === 'saved' && savedHasNextPage) ||
                    (showAppliedJobs && appliedHasNextPage)) && (
                    <div ref={observerTarget} className='flex justify-center h-[1px]'>
                      {(isFetchingNextPage) && (
                        <div className='flex items-center justify-center py-6'>
                          <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500'></div>
                        </div>
                      )}
                    </div>
                  )}
                  </div>

                 
                </>
              )}
            </main>
          </div>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!applyConfirmModal}
        onClose={cancelApplyJob}
        icon={<Briefcase />}
        iconVariant="primary"
        title='Apply for Job'
        message={`Are you sure you want to apply for ${applyConfirmModal?.title ?? 'this job'}?`}
        onConfirm={confirmApplyJob}
        confirmText='Apply'
        cancelText='Cancel'
        isLoading={applyJobMutation.isPending}
        loadingText='Applying...'
      />
      {applyGateModal}
      {authGateModal}
    </div>
  )
}

export default JobListing
