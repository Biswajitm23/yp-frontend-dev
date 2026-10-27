// Client-side checks for the Change Email modal (profile page).

// RFC 5321: a full address is at most 254 characters and its local part
// (before the @) at most 64.
export const MAX_EMAIL_LENGTH = 254
export const MAX_EMAIL_LOCAL_LENGTH = 64

/**
 * Returns the error message to show for a new email address, or null when the
 * address may be sent to the backend.
 */
export function validateNewEmail (
  value: string,
  currentEmail?: string
): string | null {
  const email = value.trim()
  if (!email) return 'Email is required'
  if (email.length > MAX_EMAIL_LENGTH) {
    return `Email address must be ${MAX_EMAIL_LENGTH} characters or fewer`
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return 'Please enter a valid email address'
  }
  if (email.slice(0, email.lastIndexOf('@')).length > MAX_EMAIL_LOCAL_LENGTH) {
    return `The part before @ must be ${MAX_EMAIL_LOCAL_LENGTH} characters or fewer`
  }
  if (email.toLowerCase() === (currentEmail ?? '').trim().toLowerCase()) {
    return 'New email must be different from your current email'
  }
  return null
}

// bis***********5679@gmail.com — keeps the first 3 and last 4 characters of
// the local part; shorter names keep only as much as leaves something masked.
export function maskEmail (email: string) {
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
