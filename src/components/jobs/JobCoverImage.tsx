'use client'

import styles from '@/moduleCss/jobDetails.module.css'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import PlaceholderImage from '../../../public/images/DefaultJobImage3.webp'
import BlurredCoverImage from '../commonUI/BlurredCoverImage'

type Props = {
  jobDetails: any
}

const JobCoverImage = ({ jobDetails }: Props) => {
  const router = useRouter()

  const coverUrl = jobDetails?.jopost_image_url

  return (
    <section className={styles.jobDetails_cover_section}>
      <div className={styles.pageHeader}>
        <div className={styles.top_area}>
          <div className='flex items-center gap-2'>
            <button
              className='backbtn-page cursor-pointer'
              onClick={() => router.back()}
              type='button'
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

      <div
        className={styles.jobDetails_cover_image_wrapper}
        style={{ position: 'relative', overflow: 'hidden' }}
      >
        {coverUrl ? (
          <BlurredCoverImage
            src={coverUrl}
            alt={jobDetails?.title || 'Job cover'}
            priority
            unoptimized
            fallbackSrc={PlaceholderImage}
          />
          // <Image
          //   src={coverUrl}
          //   alt={jobDetails?.title || 'Job cover'}
          //   fill
          //   priority
          //   sizes="100vw"
          //   style={{ objectFit: 'cover' }}
          // />
        ) : (
          <Image
            src={PlaceholderImage}
            alt={jobDetails?.title || 'Job cover'}
            fill
            priority
            sizes="100vw"
            style={{ objectFit: 'cover' }}
          />
        )}
      </div>
    </section>
  )
}

export default JobCoverImage
