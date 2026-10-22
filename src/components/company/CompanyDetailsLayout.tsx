"use client";
import React from 'react'
import companystyles from '@/moduleCss/comapnyDetails.module.css'
import CompanyCoverImage from './CompanyCoverImage'
import { fetchCompanyDetails } from '@/services/company.services'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Building2 } from 'lucide-react'
import DetailNotFound from '../commonUI/DetailNotFound'
import CompanyInfo from './CompanyInfo';
import CompanyKewordsSection from './CompanyKewordsSection';
import AboutCompany from './AboutCompany';
import BottomTabSection from './BottomTabSection';
import CompanyEventsSection from './CompanyEventsSection';
import { GlobalSpinner } from '../commonUI/loaders/spinners/GlobalSpinner';
import CompanyCoverImageSkeleton from '../commonUI/loaders/skeletons/CompanyCoverImageSkeleton';
import { CompanyInfoSkeleton } from '../commonUI/loaders/skeletons/CompanyInfoSkeleton';
import CompanyKeywordsSkeleton from '../commonUI/loaders/skeletons/CompanyKeywordsSkeleton';
import AboutCompanySkeleton from '../commonUI/loaders/skeletons/AboutCompanySkeleton';
import BottomTabSectionSkeleton from '../commonUI/loaders/skeletons/BottomTabSectionSkeleton';
type Props = {
  companyId: string
}

const CompanyDetailsLayout = ({ companyId }: Props) => {

  const router = useRouter();

  const {
    data: companyDetails,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["company-details", companyId],
    queryFn: () => fetchCompanyDetails({ id: companyId }),
    enabled: !!companyId,
  });

  if (isLoading) {
    return (<div className='container mx-auto  px-4'>
        <CompanyCoverImageSkeleton />
        <CompanyInfoSkeleton  />
        {/* <CompanyKeywordsSkeleton     /> */}
        <AboutCompanySkeleton />
        <BottomTabSectionSkeleton />
      </div>
    );
  }

  // Not found / deleted: the id resolved but there's no real company behind it.
  // Render a clean empty state instead of the cover + info shell with no data.
  if (isError || !companyDetails?.data?.id) {
    return (
      <>
        {/* Standard page-header back button (matches every other detail page). */}
        <div className="container mx-auto px-4">
          <div className={companystyles.pageHeader}>
            <div className={companystyles.top_area}>
              <div className="flex items-center gap-2">
                <button
                  className="backbtn-page cursor-pointer"
                  onClick={() => router.back()}
                  type="button"
                  aria-label="Go back"
                >
                  <span>
                    <Image
                      src="/profile/backbtn_icon.svg"
                      alt="Back"
                      width={20}
                      height={20}
                    />
                  </span>
                </button>
                <h1 className={companystyles.pageTitle}>Company Details</h1>
              </div>
            </div>
          </div>
        </div>
        <DetailNotFound
          icon={<Building2 size={28} />}
          title="Company not found"
          message="This company may have been removed or is no longer available."
          primaryLabel="Browse Companies"
          onPrimary={() => router.push("/company")}
        />
      </>
    );
  }


  return (
    <>

      <div className='container mx-auto  px-4'>
        <CompanyCoverImage companyDetails={companyDetails?.data} />
        <CompanyInfo companyDetails={companyDetails?.data} />
        {/* <CompanyKewordsSection companyDetails={companyDetails?.data}    /> */}
        <AboutCompany companyDetails={companyDetails?.data} />
        <BottomTabSection companyId={companyId} companyName={companyDetails?.data?.name}/>
        <CompanyEventsSection companyId={companyId} companyName={companyDetails?.data?.name}/>
      </div>
    </>
  )
}

export default CompanyDetailsLayout  
