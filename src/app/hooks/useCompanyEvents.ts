'use client'

import { useQuery } from '@tanstack/react-query'
import { getCompanyEvents } from '@/services/events.services'

// One page covers every company we have; the caller still reads `totalCount`
// so a heading stays honest if a company ever exceeds it.
export const COMPANY_EVENTS_PAGE_SIZE = 50

/**
 * Events hosted by one company.
 *
 * Shared by CompanyInfo — which only needs to know whether the "See all Events"
 * button should exist — and CompanyEventsSection, which renders the cards. Both
 * read ONE cached request off the same query key, rather than firing a separate
 * limit-1 existence check the way the jobs pair above them does.
 */
export function useCompanyEvents(companyId?: string) {
  const query = useQuery({
    queryKey: ['company-events', companyId, COMPANY_EVENTS_PAGE_SIZE],
    queryFn: () =>
      getCompanyEvents({
        id: companyId as string,
        page: 1,
        limit: COMPANY_EVENTS_PAGE_SIZE,
      }),
    enabled: !!companyId,
  })

  // The service hands back the verbatim backend body, i.e. the ENVELOPE
  // { status, message, data: { count, total_count, result: [...] } } — so the
  // rows live at `.data.result`. Both nestings are read anyway, the same
  // tolerance the other list widgets use, so a backend that ever unwraps one
  // level doesn't blank the section out.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload = query.data as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const events: any[] = payload?.result ?? payload?.data?.result ?? []
  const totalCount: number =
    payload?.total_count ?? payload?.data?.total_count ?? events.length

  return { ...query, events, totalCount }
}
