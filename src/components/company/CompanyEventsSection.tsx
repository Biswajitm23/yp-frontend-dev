'use client'

import * as React from 'react'
import Box from '@mui/material/Box'
import Tab from '@mui/material/Tab'
import TabContext from '@mui/lab/TabContext'
import TabList from '@mui/lab/TabList'
import TabPanel from '@mui/lab/TabPanel'
import companystyles from '@/moduleCss/comapnyDetails.module.css'
import JobStyles from '@/moduleCss/jobDetails.module.css'
import EventCard from '../events/EventCard'
import { useListingPreserve } from '@/app/hooks/useListingPreserve'
import { useCompanyEvents } from '@/app/hooks/useCompanyEvents'

// Matches the Jobs section above: show a few, reveal more as the user scrolls
// the inner list rather than dumping every card into the DOM at once.
const INITIAL_VISIBLE = 4
const LOAD_MORE_COUNT = 4

// The backend row shape is dynamic (verbatim pass-through, same as the Events
// listing), so the fields this card actually reads are declared here and the
// rest is ignored.
interface CompanyEvent {
  id: string
  title: string
  banner_image_url?: string
  sidebar_image_url?: string
  start_datetime: string
  end_datetime: string
  location: string | null
  platform_name: string | null
  offer_price: string | null
  list_price: string
  event_type_display: string
  pricing_type?: string
  availability_status?: string
  booking_status?: string | null
  external_registration_url?: string | null
}

type Props = {
  companyId: string
  companyName?: string
}

/**
 * "Events at <Company>" — the companion to BottomTabSection ("Jobs at
 * <Company>") directly above it.
 *
 * Deliberately a SIBLING of that component rather than a second tab inside it:
 * BottomTabSection returns null when the company has no jobs, so nesting would
 * hide a company's events whenever it happens to have no open roles.
 */
const CompanyEventsSection = ({ companyId, companyName }: Props) => {
  // Own preserve key — the Jobs list above uses `company-<id>`, and sharing it
  // would make the two lists fight over one visibleCount/scroll offset.
  const { saveBeforeNavigate, setScrollContainer } = useListingPreserve(
    `company-events-${companyId}`
  )
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_VISIBLE)
  const sentinelRef = React.useRef<HTMLDivElement | null>(null)

  // Shared with CompanyInfo's "See all Events" button — one request, one cache.
  const { events: rawEvents, totalCount, isLoading, isError } =
    useCompanyEvents(companyId)
  const events = rawEvents as CompanyEvent[]

  const visibleEvents = events.slice(0, visibleCount)
  const hasMoreToShow = visibleCount < events.length

  React.useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) {
          setVisibleCount(prev => Math.min(prev + LOAD_MORE_COUNT, events.length))
        }
      },
      { threshold: 0.1 }
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [events.length])

  // Nothing renders until the read settles. The Jobs section above renders its
  // frame immediately and tears it down when the count comes back empty, but
  // most companies host no events at all — doing the same here would flash a
  // phantom "Events at X (0)" panel on the majority of company pages, and
  // would briefly state a count we do not know yet. Waiting costs a small
  // pop-in on the companies that DO have events; that is the cheaper artifact.
  if (isLoading || isError || events.length === 0) return null

  return (
    <div
      id='events-section'
      className={companystyles.company_bottom_tab_section}
    >
      <Box sx={{ width: '100%', typography: 'body1' }}>
        {/* Single fixed tab, mirroring the Jobs section's header so the two
            read as one stacked pair rather than two different treatments. */}
        <TabContext value='1'>
          <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
            <TabList className={companystyles.company_bottom_tab_box}>
              <Tab
                label={`Events at ${companyName || ''} (${totalCount})`}
                value='1'
                className={companystyles.company_bottom_tab_name}
              />
            </TabList>
          </Box>

          <TabPanel value='1' className={companystyles.company_other_oppurtunities}>
            <div className={companystyles.company_other_oppurtunities_inner}>
              <div
                className={`${JobStyles.jobListing_more_jobs_card_wrapper} scrollbar-hide`}
                style={{ overflowX: 'hidden', overflowY: 'auto' }}
                ref={setScrollContainer}
              >
                <div className={companystyles.jobListing_more_jobs_cards}>
                    {visibleEvents.map(event => (
                      <div
                        key={event.id}
                        className={`col-lg-6 ${companystyles.company_events_card_col}`}
                      >
                        <EventCard
                          id={event.id}
                          banner_image_url={event.banner_image_url || ''}
                          sidebar_image_url={event.sidebar_image_url}
                          title={event.title}
                          start_datetime={event.start_datetime}
                          end_datetime={event.end_datetime}
                          location={event.location}
                          platform_name={event.platform_name}
                          offer_price={event.offer_price}
                          list_price={event.list_price}
                          event_type_display={event.event_type_display}
                          pricing_type={event.pricing_type}
                          availability_status={event.availability_status}
                          is_booked={event.booking_status === 'confirmed'}
                          bookingStatus={event.booking_status ?? undefined}
                          external_registration_url={event.external_registration_url}
                          onBeforeNavigate={saveBeforeNavigate}
                        />
                    </div>
                  ))}
                </div>

                {hasMoreToShow && (
                  <div
                    ref={sentinelRef}
                    className='flex items-center justify-center py-6'
                  >
                    <div className='animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500' />
                  </div>
                )}
              </div>
            </div>
          </TabPanel>
        </TabContext>
      </Box>
    </div>
  )
}

export default CompanyEventsSection
