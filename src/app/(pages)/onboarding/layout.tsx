import Header from "@/components/commonUI/Header";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-page-shell">
      {/* Site header so users can navigate while completing their profile —
          matches the Login / Sign up / verify treatment. */}
      <Header />
      {/* Offsets the auth background by the header height so the form stays
          centered without introducing an extra page scroll. */}
      <div className="auth-with-header">
        {children}
      </div>
    </div>
  );
}
