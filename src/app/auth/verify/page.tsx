
import OtpVerificationPage from "@/components/authentication/VerifyClient";
import { GlobalSpinner } from "@/components/commonUI/loaders/spinners/GlobalSpinner";
import Header from "@/components/commonUI/Header";
import React, { Suspense } from "react";

export default function VerifyPage() {
  return (
    <div className="auth-page-shell">
      {/* Site header so visitors can navigate while verifying their code —
          matches the Login / Sign up / forgot-password treatment. */}
      <Header />
      {/* Offsets the auth background by the header height so the card stays
          vertically centered without introducing a page scroll. */}
      <div className="auth-with-header">
        <Suspense fallback={<div className="flex items-center justify-center min-h-[70vh]"><GlobalSpinner /></div>}>
          {/* The client component will hydrate on the client */}
          <OtpVerificationPage />
        </Suspense>
      </div>
    </div>
  );
}