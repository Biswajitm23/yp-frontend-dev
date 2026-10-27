// components/profile/UpdateEmailModal.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'react-toastify'
import { CustomModal } from '../modals/CustomModal'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  sendUpdateEmailOtp,
  verifyUpdateEmailOtp
} from '@/services/auth.services'
import { maskEmail, validateNewEmail } from '@/lib/emailValidation'

const OTP_LENGTH = 6
const EMPTY_OTP = Array<string>(OTP_LENGTH).fill('')
// Same cooldown as the auth verify screen
const RESEND_COOLDOWN = 90

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail?: string
  onEmailUpdated?: (email: string) => void
  // Element that gets focus back when the modal closes (the Edit Email pencil)
  returnFocusRef?: React.RefObject<HTMLElement | null>
}

export default function UpdateEmailModal ({
  open,
  onOpenChange,
  currentEmail,
  onEmailUpdated,
  returnFocusRef
}: Props) {
  const [email, setEmail] = useState('')
  const emailInputRef = useRef<HTMLInputElement>(null)
  // One entry per box — same six-box OTP field as the auth verify screen.
  const [otpDigits, setOtpDigits] = useState<string[]>(EMPTY_OTP)
  const otpRefs = useRef<(HTMLInputElement | null)[]>([])
  const otp = otpDigits.join('')
  // false → only the email input + "Send OTP"; true → OTP input + "Verify OTP"
  const [otpSent, setOtpSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Countdown for the resend cooldown
  useEffect(() => {
    if (resendTimer <= 0) return
    const t = setTimeout(() => setResendTimer((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [resendTimer])

  const resetForm = () => {
    setEmail('')
    setOtpDigits(EMPTY_OTP)
    setOtpSent(false)
    setResendTimer(0)
  }

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting || isResending) return
    if (!next) resetForm()
    onOpenChange(next)
  }

  const handleSendOtp = async () => {
    const newEmail = email.trim()
    const error = validateNewEmail(newEmail, currentEmail)
    if (error) {
      toast.error(error)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await sendUpdateEmailOtp(newEmail)
      if (res.status === 'ERROR') {
        toast.error(res.message || 'Failed to send OTP. Please try again.')
        return
      }
      toast.success(res.message || 'OTP sent successfully')
      setEmail(newEmail)
      setOtpSent(true)
      setResendTimer(RESEND_COOLDOWN)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to send OTP. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // The send-otp endpoint issues a fresh code each call, so resend reuses it
  const handleResendOtp = async () => {
    if (isResending || isSubmitting || resendTimer > 0) return

    setIsResending(true)
    try {
      const res = await sendUpdateEmailOtp(email)
      if (res.status === 'ERROR') {
        toast.error(res.message || 'Failed to resend OTP. Please try again.')
        return
      }
      toast.success(res.message || 'OTP resent successfully')
      setOtpDigits(EMPTY_OTP)
      setResendTimer(RESEND_COOLDOWN)
      // Inputs are disabled while resending, so focus after they re-enable
      setTimeout(() => focusOtpInput(0), 0)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to resend OTP. Please try again.'
      )
    } finally {
      setIsResending(false)
    }
  }

  const focusOtpInput = (index: number) => {
    const input = otpRefs.current[index]
    input?.focus()
    // Select the digit so the next keystroke replaces it instead of being
    // swallowed by maxLength when the box is already filled.
    input?.select()
  }

  const handleOtpChange = (index: number, value: string) => {
    // A filled box can briefly hold 2 chars, so keep only the last digit typed
    const digit = value.replace(/\D/g, '').slice(-1)
    if (value && !digit) return
    const next = [...otpDigits]
    next[index] = digit
    setOtpDigits(next)
    if (digit && index < OTP_LENGTH - 1) focusOtpInput(index + 1)
  }

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    switch (e.key) {
      // Single-char inputs never move the caret, so drive focus manually
      case 'ArrowLeft':
        e.preventDefault()
        if (index > 0) focusOtpInput(index - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        if (index < OTP_LENGTH - 1) focusOtpInput(index + 1)
        break
      case 'Backspace':
        if (!otpDigits[index] && index > 0) {
          e.preventDefault()
          const next = [...otpDigits]
          next[index - 1] = ''
          setOtpDigits(next)
          focusOtpInput(index - 1)
        }
        break
      default:
        break
    }
  }

  // Handles pasting a full OTP
  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    const pasteData = e.clipboardData.getData('text').trim()
    if (!new RegExp(`^\\d{${OTP_LENGTH}}$`).test(pasteData)) return
    setOtpDigits(pasteData.split(''))
    focusOtpInput(OTP_LENGTH - 1)
  }

  const handleVerifyOtp = async () => {
    if (otp.length !== OTP_LENGTH) {
      toast.error(`Please enter the ${OTP_LENGTH} digit OTP`)
      return
    }

    setIsSubmitting(true)
    try {
      const res = await verifyUpdateEmailOtp(email, otp)
      if (res.status === 'ERROR') {
        toast.error(res.message || 'The OTP is invalid or has expired')
        return
      }
      toast.success(res.message || 'Email updated successfully')
      onEmailUpdated?.(email)
      resetForm()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : 'Failed to verify OTP. Please try again.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (isSubmitting || isResending) return
    if (otpSent) handleVerifyOtp()
    else handleSendOtp()
  }

  return (
    <CustomModal
      open={open}
      onOpenChange={handleOpenChange}
      title="Change Email"
      description={
        otpSent
          ? `Please enter a six digit code sent on your ${maskEmail(email.trim())} for verification`
          : "Enter your new email address"
      }
      width="max-w-md"
      // Long addresses must wrap inside the modal instead of overflowing it
      headerClassName="[overflow-wrap:anywhere]"
      // Move focus into the modal so Radix's focus trap keeps Tab inside it
      // (focus left on the page behind escapes the trap), and hand it back to
      // the Edit Email pencil on close (there is no DialogTrigger to return to).
      onOpenAutoFocus={(e) => {
        e.preventDefault()
        emailInputRef.current?.focus()
      }}
      onCloseAutoFocus={(e) => {
        if (!returnFocusRef?.current) return
        e.preventDefault()
        returnFocusRef.current.focus()
      }}
      contentClassName="backdrop-blur-xl border shadow-2xl !rounded-xl bg-white border-gray-200 text-gray-900 [&_*]:text-gray-900 dark:bg-gradient-to-br dark:from-blue-600/20 dark:via-blue-500/15 dark:to-blue-700/20 dark:border-white/20 dark:text-white dark:[&_*]:text-white"
      footer={
        <div className="flex items-center justify-end gap-3">
          <Button
            type="submit"
            variant="custom_background_gradient"
            onClick={() => handleSubmit()}
            className="bg-black cursor-pointer"
            disabled={
              isSubmitting ||
              isResending ||
              (otpSent ? otp.length !== OTP_LENGTH : !email.trim())
            }
          >
            {otpSent
              ? isSubmitting
                ? "Verifying..."
                : "Verify OTP"
              : isSubmitting
                ? "Sending..."
                : "Send OTP"}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-6">
        <div className="space-y-2 form-input-custom">
          <Label htmlFor="newEmail">New Email</Label>
          <Input
            ref={emailInputRef}
            id="newEmail"
            name="newEmail"
            type="email"
            autoComplete="email"
            placeholder="Enter new email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={otpSent || isSubmitting}
          />
        </div>

        {otpSent && (
          <div className="space-y-2">
            <Label htmlFor="emailOtp-0">OTP</Label>
            <div className="flex justify-center gap-2">
              {otpDigits.map((digit, index) => (
                <input
                  key={index}
                  id={`emailOtp-${index}`}
                  ref={(el) => {
                    otpRefs.current[index] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  aria-label={`OTP digit ${index + 1}`}
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleOtpChange(index, e.target.value)}
                  onKeyDown={(e) => handleOtpKeyDown(index, e)}
                  onPaste={handleOtpPaste}
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.currentTarget.select()}
                  disabled={isSubmitting || isResending}
                  autoFocus={index === 0}
                  className="otp-form-input"
                />
              ))}
            </div>
            <p className="text-center text-sm pt-4">
              Didn&apos;t receive the code?{" "}
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={isResending || isSubmitting || resendTimer > 0}
                className="font-semibold hover:underline cursor-pointer disabled:cursor-not-allowed disabled:hover:no-underline"
              >
                {isResending
                  ? "Resending..."
                  : resendTimer > 0
                    ? `Resend in ${resendTimer}s`
                    : "Resend OTP"}
              </button>
            </p>
          </div>
        )}
        {/* Hidden submit button enables Enter-key submission */}
        <button
          type="submit"
          aria-hidden="true"
          tabIndex={-1}
          className="hidden"
        />
      </form>
    </CustomModal>
  );
}
