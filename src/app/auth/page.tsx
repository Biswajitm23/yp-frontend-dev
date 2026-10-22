// app/page.tsx (Server Component)
import { Suspense } from "react";
import AuthWrapper from "@/components/authentication/AuthWrapper";
import { GlobalSpinner } from "@/components/commonUI/loaders/spinners/GlobalSpinner";
import Header from "@/components/commonUI/Header";

const Page = () => {
  // AuthWrapper's child components read `useSearchParams` (to preserve the
  // callbackUrl from email deep links). Next.js requires that to sit inside
  // a Suspense boundary during prerender, otherwise the /auth build bails.
  return (
    <div className='auth-page-shell'>
      {/* Site header on the Login / Sign up page so visitors can still
          navigate (logo + nav) while authenticating. The header follows the
          app theme (the /auth route is no longer hard-forced to dark). */}
      <Header />
      {/* Offsets the auth background by the header height so the compact
          card stays vertically centered without introducing a page scroll. */}
      <div className='auth-with-header'>
        <Suspense
          fallback={
            <div className='flex items-center justify-center min-h-[70vh]'>
              <GlobalSpinner />
            </div>
          }
        >
          <AuthWrapper />
        </Suspense>
      </div>
    </div>
  );
}

export default Page;