// components/profile/AboutCard.tsx

'use client'

import { useEffect, useState } from 'react'
import styles from '../../moduleCss/profile.module.css'
import { CustomModalForm, type FormField } from '../modals/CustomModalForm'
import { updateUserProfile } from '@/services/profile.services'
import { isContextualStatus, getCareerStatusNameById } from '@/helpers/careerStatus'
import { useTheme, themePreferenceToApi } from '@/context/ThemeContext'
import { toast } from 'react-toastify'
import { useAuthGate } from '@/app/hooks/useAuthGate'
import { isUnauthenticatedError } from '@/lib/authError'
import { type Education } from '@/app/hooks/useUserProfile'

type Props = {
  about: string
  dob?: string
  careerStatus?: string
  currentSituation?: string
  educations?: Education[]
  onAboutUpdated?: (about: string) => void
  onJourneyUpdated?: (currentSituation: string) => void
}

export default function AboutCard({ about, dob, careerStatus, currentSituation, educations, onAboutUpdated, onJourneyUpdated }: Props) {
  const [situationExpanded, setSituationExpanded] = useState(false)
  const [openModal, setOpenModal] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [localAbout, setLocalAbout] = useState(about || '')
  // My Journey (single top-level current_situation) — editable directly here.
  const [openJourneyModal, setOpenJourneyModal] = useState(false)
  const [isJourneySubmitting, setIsJourneySubmitting] = useState(false)
  const [localSituation, setLocalSituation] = useState(currentSituation || '')
  const { preference } = useTheme()
  const { ensureAuthed, openGate, gateModal: authGateModal } = useAuthGate()

  // Keep the journey text in sync when it changes upstream (e.g. saved from the
  // Education form). Draft editing uses a separate modal value, so this is safe.
  useEffect(() => {
    setLocalSituation(currentSituation || '')
  }, [currentSituation])

  // Show My Journey whenever ANY education entry is contextual (gap year /
  // finished) — not just the first one — with the top-level (latest) journey.
  const hasContextualEducation =
    (Array.isArray(educations) &&
      educations.some((e) =>
        isContextualStatus(getCareerStatusNameById(e.education_status ?? '')),
      )) ||
    (!!careerStatus && isContextualStatus(careerStatus))

  const fields: FormField[] = [
    {
      id: 'about',
      name: 'about',
      label: 'About',
      type: 'textarea',
      // About is optional — no required "*" mark. An empty value is allowed and
      // simply clears the bio.
      required: false,
      value: localAbout,
      className: "custom-textarea-about",
      placeholder: 'Please add a short bio about yourself.',
      rows: 6,
    },
  ]

  const journeyFields: FormField[] = [
    {
      id: 'current_situation',
      name: 'current_situation',
      label: 'Current Situation',
      type: 'textarea',
      required: true,
      value: localSituation,
      className: "custom-textarea-about",
      placeholder: 'Current Situation*',
      rows: 5,
    },
  ]

  const handleSubmit = async (data: Record<string, any>) => {
    ensureAuthed("update your profile", async () => {
      // About is optional: an empty value is allowed (clears the bio).
      setIsSubmitting(true)
      try {
        const payload = {
          about: (data.about ?? '').trim(),
          // Backend update-profile is full-replace; preserve theme so the
          // user's appearance choice doesn't silently revert to dark, and
          // re-send the existing DOB so it isn't wiped (only ProfileInfoCard,
          // where the user can clear it, ever removes it).
          theme_setting: themePreferenceToApi(preference),
          ...(dob ? { dob } : {}),
        }

        const res = await updateUserProfile(payload)

        toast.success(res.message || 'About updated successfully')

        setLocalAbout(payload.about)
        onAboutUpdated?.(payload.about)

        setOpenModal(false)
      } catch (error: any) {
        if (isUnauthenticatedError(error)) openGate('update your profile')
        else toast.error(error.message || 'Update failed')
      } finally {
        setIsSubmitting(false)
      }
    })
  }

  const handleJourneySubmit = async (data: Record<string, any>) => {
    ensureAuthed("update your profile", async () => {
      if (!data.current_situation || !data.current_situation.trim()) {
        toast.error('Current Situation cannot be empty')
        return
      }

      setIsJourneySubmitting(true)
      try {
        const payload = {
          current_situation: data.current_situation.trim(),
          theme_setting: themePreferenceToApi(preference),
          // Preserve the existing DOB across this full-replace update.
          ...(dob ? { dob } : {}),
        }

        const res = await updateUserProfile(payload)

        toast.success(res.message || 'Current Situation updated successfully')

        setLocalSituation(payload.current_situation)
        onJourneyUpdated?.(payload.current_situation)

        setOpenJourneyModal(false)
      } catch (error: any) {
        if (isUnauthenticatedError(error)) openGate('update your profile')
        else toast.error(error.message || 'Update failed')
      } finally {
        setIsJourneySubmitting(false)
      }
    })
  }

  return (
    <div className="mt-4">
      <div className="card_custom min-h-36">
        <div className={styles.profileInfo}>
          <div className={styles.nameWrapper}>
            <h2 className={styles.section_title}>About</h2>

            <CustomModalForm
            maxHeight='min(480px, 85vh)'
            scrollAreaClassName="not-scrollable"
              open={openModal}
              onOpenChange={setOpenModal}
              trigger={
                <button
                  type="button"
                  aria-label="Edit About"
                  className={styles.editBtn}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width={20}
                    height={20}
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
                  Edit
                </button>
              }
              title="Edit About"
              description="Update your About information"
              fields={fields}
              onSubmit={handleSubmit}
              submitLabel="Save"
              cancelLabel="Cancel"
              isSubmitting={isSubmitting}
              submitButtonClassName="bg-black cursor-pointer"
              cancelButtonClassName="bg-black cursor-pointer"
              contentClassName="backdrop-blur-xl border shadow-2xl !rounded-xl bg-white border-gray-200 text-gray-900 [&_*]:text-gray-900 dark:bg-gradient-to-br dark:from-blue-600/20 dark:via-blue-500/15 dark:to-blue-700/20 dark:border-white/20 dark:text-white dark:[&_*]:text-white"
            />
          </div>
          {authGateModal}

          <p className={`${styles.profile_info} ${styles.about_description}`}>
            {localAbout || 'Please add a short bio about yourself.'}
          </p>

          {/* {hasContextualEducation &&
            localSituation &&
            localSituation.trim() && (
              <div className={styles.current_situation_wrapper}>
                <hr className={styles.current_situation_divider} />
                <div className={styles.nameWrapper}>
                  <p className={styles.section_title}>
                    My Journey
                  </p>

                  <CustomModalForm
                    maxHeight='min(480px, 85vh)'
                    scrollAreaClassName="not-scrollable"
                    open={openJourneyModal}
                    onOpenChange={setOpenJourneyModal}
                    trigger={
                      <button
                        type="button"
                        aria-label="Edit My Journey"
                        className={styles.editBtn}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width={20}
                          height={20}
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
                        Edit
                      </button>
                    }
                    title="Edit My Journey"
                    description="Update your journey"
                    fields={journeyFields}
                    onSubmit={handleJourneySubmit}
                    submitLabel="Save"
                    cancelLabel="Cancel"
                    isSubmitting={isJourneySubmitting}
                    submitButtonClassName="bg-black cursor-pointer"
                    cancelButtonClassName="bg-black cursor-pointer"
                    contentClassName="backdrop-blur-xl border shadow-2xl !rounded-xl bg-white border-gray-200 text-gray-900 [&_*]:text-gray-900 dark:bg-gradient-to-br dark:from-blue-600/20 dark:via-blue-500/15 dark:to-blue-700/20 dark:border-white/20 dark:text-white dark:[&_*]:text-white"
                  />
                </div>
                <p
                  className={`${styles.profile_info} ${styles.about_description}`}
                  style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                >
                  {localSituation.length > 120 && !situationExpanded
                    ? `${localSituation.slice(0, 120)}…`
                    : localSituation}
                </p>
                {localSituation.length > 120 && (
                  <button
                    type="button"
                    onClick={() => setSituationExpanded((v) => !v)}
                    className={styles.current_situation_toggle}
                  >
                    {situationExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </div>
            )} */}
        </div>
      </div>
    </div>
  )
}

