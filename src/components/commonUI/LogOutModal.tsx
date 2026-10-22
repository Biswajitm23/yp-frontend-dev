'use client';

import { useState, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ConfirmIconVariant = "danger" | "warning" | "info" | "primary";

// Icon badge tint/ring + icon color per semantic variant.
const ICON_VARIANT_STYLES: Record<
  ConfirmIconVariant,
  { bg: string; border: string; color: string }
> = {
  danger: { bg: "rgba(220, 38, 38, 0.12)", border: "rgba(220, 38, 38, 0.30)", color: "#ef4444" },
  warning: { bg: "rgba(245, 158, 11, 0.12)", border: "rgba(245, 158, 11, 0.30)", color: "#f59e0b" },
  info: { bg: "rgba(59, 130, 246, 0.12)", border: "rgba(59, 130, 246, 0.30)", color: "#60a5fa" },
  primary: { bg: "rgba(84, 51, 255, 0.12)", border: "rgba(84, 51, 255, 0.30)", color: "#7c6cff" },
};

// Modal Props Type
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  // Optional icon rendered in a circular badge above the title. Pass a bare
  // lucide icon (e.g. <UserRoundMinus size={30} />).
  icon?: ReactNode;
  iconVariant?: ConfirmIconVariant;
}
export default function LogOutModal({
  isOpen,
  onClose,
  title,
  children,
  onConfirm,
  confirmText = "Yes",
  cancelText = "No",
  icon,
  iconVariant = "primary",
}: ModalProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      setTimeout(() => setIsClosing(false), 20);
    } else {
      setIsClosing(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsClosing(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);
  const handleClose = () => {
    onClose();
  };
  const handleConfirmClick = () => {
    if (onConfirm) onConfirm();
    handleClose();
  };
  if (!isVisible) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ isolation: "isolate" }}>
      
      {/* Backdrop */}
      <div 
        className={`absolute custom-modal-backdrop transition-opacity duration-200 
          ${isClosing ? "opacity-0" : "opacity-100"}`}
        onClick={handleClose}
      />
      {/* Modal Container */}
      <div
        className={`relative custom-modal-container transition-opacity duration-200
          ${isClosing ? "opacity-0" : "opacity-100"}`}
      >
        {/* Modal Content with Scale Animation */}
        <div
          className={`custom-modal-content transition-transform duration-300
            ${isClosing ? "scale-90" : "scale-100"}`}
        >
          {icon && (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 9999,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
                background: ICON_VARIANT_STYLES[iconVariant].bg,
                border: `1px solid ${ICON_VARIANT_STYLES[iconVariant].border}`,
                color: ICON_VARIANT_STYLES[iconVariant].color,
              }}
            >
              {icon}
            </div>
          )}
          <h2 className="modal-title">{title}</h2>
          {children && (
            <div className="text-slate-600 dark:text-slate-300 text-center mb-6">
              {children}
            </div>
          )}
          <div className="flex gap-4 modal-btn-wrapper justify-center">
            <button
              onClick={handleConfirmClick}
              className="btn-gradient w-full cursor-pointer"
            >
              {confirmText}
            </button>
            <button
              onClick={handleClose}
              className="gradient-border-btn hover:btn-gradient w-full cursor-pointer"
            >
              {cancelText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}