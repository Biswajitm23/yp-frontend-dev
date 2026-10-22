'use client'

import { ReactNode, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import mainstyles from '@/moduleCss/jobDetails.module.css'
import { useTheme } from '@/context/ThemeContext'
import { is } from 'date-fns/locale'

// Semantic color for the icon badge. Drives the badge tint/ring and the icon
// color (lucide icons inherit `currentColor`).
export type ConfirmIconVariant = 'danger' | 'warning' | 'info' | 'primary'

interface ConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  // Optional custom handler for the left (secondary) button. Defaults to
  // `onClose` so existing cancel-style modals are unaffected; callers like the
  // auth gate pass their own (e.g. "Sign up") to make it a second action.
  onCancel?: () => void
  title: string
  message: ReactNode
  confirmText?: string
  cancelText?: string
  isLoading?: boolean
  loadingText?: string
  // When true, render no action buttons — the modal is informational and closes
  // only via the top-right X (or Escape / backdrop click).
  hideActions?: boolean
  // Optional icon rendered in a circular badge above the title. Pass a bare
  // lucide icon (e.g. <Trash2 />) — sizing/color are handled by the badge.
  icon?: ReactNode
  // Color theme for the icon badge. Defaults to "primary".
  iconVariant?: ConfirmIconVariant
  // Tint for the left (secondary) button. "danger" turns its label red — used
  // for destructive secondary actions like "Discard" on the unsaved-changes
  // prompt, where the safe choice is the primary button on the right.
  cancelVariant?: 'default' | 'danger'
}

export default function ConfirmModal ({
  isOpen,
  onClose,
  onConfirm,
  onCancel,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isLoading = false,
  loadingText,
  hideActions = false,
  icon,
  iconVariant = 'primary',
  cancelVariant = 'default'
}: ConfirmModalProps) {
  const [visible, setVisible] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [mounted, setMounted] = useState(false)

  const { resolvedTheme } = useTheme()
  const isLight = resolvedTheme === 'light'

  // Ensure we're on the client before using createPortal
  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle open/close animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true)
      requestAnimationFrame(() => setAnimating(true))
    } else {
      setAnimating(false)
      const timer = setTimeout(() => setVisible(false), 250)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Lock background scroll. Restore whatever was set before instead of blanket
  // clearing it — this modal can stack on top of a Radix dialog (e.g. the
  // unsaved-changes prompt over an edit form), and that dialog's own scroll
  // lock must survive our cleanup.
  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!mounted || !visible) return null

  return createPortal(
    <>
      <style>{`
        @keyframes confirmSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes overlayOut {
          from { opacity: 1; }
          to   { opacity: 0; }
        }
        @keyframes modalIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(16px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes modalOut {
          from {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
          to {
            opacity: 0;
            transform: scale(0.92) translateY(16px);
          }
        }
        .confirm-overlay {
          animation: overlayIn 0.22s ease forwards;
        }
        .confirm-overlay.closing {
          animation: overlayOut 0.22s ease forwards;
        }
        .confirm-modal {
          animation: modalIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .confirm-modal.closing {
          animation: modalOut 0.22s ease forwards;
        }
        /* Light-mode globals set 16px (with !important on save), so force
           12px here for the ConfirmModal action buttons. */
        .confirm-modal .light-save-btn,
        .confirm-modal .light-apply-btn {
          font-size: 12px !important;
        }
        /* Destructive secondary action (e.g. "Discard"). Two-class specificity
           so it beats the !important color on .light-save-btn in light mode. */
        .confirm-modal .confirm-cancel-danger,
        .confirm-modal .confirm-cancel-danger:hover {
          color: #ef4444 !important;
        }
        /* Icon badge — circular tinted badge above the title. */
        .confirm-icon-badge {
    width: 60px;
    height: 60px;
    border-radius: 9999px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
}
        .confirm-icon-badge svg {
          width: 24px;
          height: 24px;
        }
        .confirm-icon-badge[data-variant="danger"] {
          background: rgba(220, 38, 38, 0.12);
          border: 1px solid rgba(220, 38, 38, 0.30);
          color: #ef4444;
        }
        .confirm-icon-badge[data-variant="warning"] {
          background: rgba(245, 158, 11, 0.12);
          border: 1px solid rgba(245, 158, 11, 0.30);
          color: #f59e0b;
        }
        .confirm-icon-badge[data-variant="info"] {
          background: rgba(59, 130, 246, 0.12);
          border: 1px solid rgba(59, 130, 246, 0.30);
          color: #60a5fa;
        }
        .confirm-icon-badge[data-variant="primary"] {
          background: rgba(84, 51, 255, 0.12);
          border: 1px solid rgba(84, 51, 255, 0.30);
          color: #7c6cff;
        }
      `}</style>

      <div
        className={`fixed inset-0 flex items-center justify-center glass-effect-modal-overlay confirm-overlay${
          !animating ? ' closing' : ''
        }`}
        // `pointerEvents: auto` is required when this stacks over a Radix
        // dialog: that dialog sets `pointer-events: none` on <body>, which we
        // would otherwise inherit and become unclickable.
        style={{ zIndex: 9999, pointerEvents: 'auto' }}
        onClick={onClose}
      >
        <div
          className={`relative rounded-2xl p-6 w-[90%] max-w-sm glass-effect-modal bg-slate-900 confirm-modal${
            !animating ? ' closing' : ''
          }`}
          onClick={e => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            disabled={isLoading}
            className='absolute top-4 right-4 text-gray-400 hover:text-white transition-colors'
            style={{ cursor: isLoading ? 'not-allowed' : 'pointer' }}
          >
            <X className='w-5 h-5' />
          </button>

          {/* Icon badge */}
          {icon && (
            <div className='confirm-icon-badge' data-variant={iconVariant}>
              {icon}
            </div>
          )}

          {/* Title */}
          <h2
            className='text-white text-lg font-semibold text-center mb-2 px-6'
            style={isLight ? { color: '#040F1F' } : {}}
          >
            {title}
          </h2>

          {/* Message */}
          <p
            className='text-gray-400 text-sm text-center mb-6'
            style={isLight ? { color: '#888888' } : {}}
          >
            {message}
          </p>

          {/* Buttons */}
          {!hideActions && (
            <div className='flex gap-3'>
              <button
                onClick={onCancel ?? onClose}
                disabled={isLoading}
                className={`${
                  isLight
                    ? 'light-save-btn width-auto-css flex-1 w-full'
                    : `flex-1 py-2.5 text-sm font-medium transition-all ${mainstyles.jobDetails_job_item_btns} social-media-btn gradient-border-btn`
                }${cancelVariant === 'danger' ? ' confirm-cancel-danger' : ''}`}
                style={{
                  height: '36px',
                  fontSize: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer'
                }}
              >
                {cancelText}
              </button>

              <button
                onClick={onConfirm}
                disabled={isLoading}
                className={`flex-1 py-2.5 text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 btn-gradient ${
                  isLight ? 'light-apply-btn width-auto-css w-full' : ''
                }`}
                style={{
                  height: '36px',
                  fontSize: '12px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.7 : 1
                }}
              >
                {isLoading ? (
                  <>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        border: '2px solid rgba(255,255,255,0.6)',
                        borderTopColor: '#fff',
                        borderRadius: '50%',
                        display: 'inline-block',
                        animation: 'confirmSpin 0.7s linear infinite'
                      }}
                    />
                    {loadingText ?? confirmText}
                  </>
                ) : (
                  confirmText
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  )
}
