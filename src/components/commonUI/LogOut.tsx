"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import ConfirmModal from "./ConfirmModal";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { clearAllListingState } from "@/app/hooks/useListingState";
import { clearOnboardingDraft } from "@/lib/onboardingDraft";
import { releaseOnboardingTab } from "@/lib/onboardingTabGuard";


type LogoutButtonProps = {
  className?: string;
};

export default function LogoutButton({ className = "" }: LogoutButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const router = useRouter();
  const queryClient = useQueryClient(); // TanStack

  const openModal = () => setIsModalOpen(true);

  const closeModal = () => {
    if (isLoggingOut) return;
    setIsModalOpen(false);
  };

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);

      /* ---------------- BACKEND LOGOUT ---------------- */
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });

      /* ---------------- CLEAR TANSTACK CACHE ---------------- */
      queryClient.clear();

      /* ---------------- CLEAR PERSISTED LISTING STATE ---------------- */
      // Drop per-tab listing UI state so the next login starts clean.
      clearAllListingState();

      /* ---------------- CLEAR ONBOARDING DRAFT ---------------- */
      // A half-finished onboarding belongs to the account that started it.
      clearOnboardingDraft();
      // Release the "stepper lives in this tab" claim, otherwise the next
      // account to sign up in this browser session would be bounced back to
      // /auth by the guard.
      releaseOnboardingTab();

      /* ---------------- NEXTAUTH SIGNOUT ---------------- */
      await signOut({
        redirect: false, // prevent double navigation
      });

      /* ---------------- REDIRECT ---------------- */
      router.replace("/auth");
    } catch (err) {
      console.error("Logout error:", err);
    } finally {
      setIsLoggingOut(false);
      setIsModalOpen(false);
    }
  };

  return (
    <>
      <button
        onClick={openModal}
        className={`btn-gradient min-w-[190px] flex items-center justify-center gap-2 cursor-pointer ${className}`}
      >
        <LogOut size={20} />
        Logout
      </button>

      <ConfirmModal
        isOpen={isModalOpen}
        onClose={closeModal}
        onConfirm={handleLogout}
        icon={<LogOut />}
        iconVariant="danger"
        title="Confirmation"
        message="Are you sure?"
        confirmText="Yes"
        cancelText="No"
        isLoading={isLoggingOut}
        loadingText="Logging out..."
      />
    </>
  );
}
