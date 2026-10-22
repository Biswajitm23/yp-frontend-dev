'use client'

import companystyles from '@/moduleCss/comapnyDetails.module.css'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import PlaceholderImage from '../../../public/images/company.webp'
import BlurredCoverImage from '../commonUI/BlurredCoverImage'

type Props = {
  companyDetails: any
}
const CompanyCoverImage = (companyDetails: Props) => {
  const router = useRouter()

  const bannerUrl = companyDetails?.companyDetails?.banner_url

  return (
    <section className={companystyles.companyCoverImage_area_main_section}>
        <div className={companystyles.pageHeader}>
          <div className={companystyles.top_area}>
            <div className='flex items-center gap-2 '>
              <button className='backbtn-page cursor-pointer' onClick={() => router.back()} type='button'>
                <span>
                  <Image
                    src='/profile/backbtn_icon.svg'
                    alt='Back'
                    width={20}
                    height={20}
                  />
                </span>
              </button>
              <h1 className={companystyles.pageTitle}>Company Details</h1>
            </div>
          </div>
        </div>

        <div
          className={companystyles.companyCoverImage_area}
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          {bannerUrl ? (
            <BlurredCoverImage
              src={bannerUrl}
              alt={companyDetails?.companyDetails?.name || 'Company cover'}
              priority
              unoptimized
              fallbackSrc={PlaceholderImage}
            />
          ) : (
            <Image
              src={PlaceholderImage}
              alt={companyDetails?.companyDetails?.name || 'Company cover'}
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

export default CompanyCoverImage
