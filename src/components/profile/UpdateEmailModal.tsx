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

const OTP_LENGTH = 6
const EMPTY_OTP = Array<string>(OTP_LENGTH).fill('')
// Same cooldown as the auth verify screen
const RESEND_COOLDOWN = 90

// bis***********5679@gmail.com — keeps the first 3 and last 4 characters of
// the local part; shorter names keep only as much as leaves something masked.
const maskEmail = (email: string) => {
  const at = email.lastIndexOf('@')
  if (at < 1) return email
  const name = email.slice(0, at)
  const head = Math.min(3, name.length - 1)
  const tail = Math.min(4, Math.max(0, name.length - head - 1))
  return (
    name.slice(0, head) +
    '*'.repeat(name.length - head - tail) +
    name.slice(name.length - tail) +
    email.slice(at)
  )
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentEmail?: string
  onEmailUpdated?: (email: string) => void
}

export default function UpdateEmailModal ({
  open,
  onOpenChange,
  currentEmail,
  onEmailUpdated
}: Props) {
  const [email, setEmail] = useState('')
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
    if (!newEmail) {
      toast.error('Email is required')
      return
    }
    if (!/^\S+@\S+\.\S+$/.test(newEmail)) {
      toast.error('Please enter a valid email address')
      return
    }
    if (newEmail.toLowerCase() === (currentEmail ?? '').trim().toLowerCase()) {
      toast.error('New email must be different from your current email')
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
