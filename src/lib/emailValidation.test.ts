import { describe, it, expect } from 'vitest'
import {
  maskEmail,
  validateNewEmail,
  MAX_EMAIL_LENGTH
} from './emailValidation'

// An address of exactly `length` characters on example.com whose local part
// stays within its own 64-character limit.
function addressOfLength (length: number) {
  const local = 'a'.repeat(60)
  const domain = 'example.com'
  return local + '@' + 'b'.repeat(length - local.length - domain.length - 2) + '.' + domain
}

describe('validateNewEmail', () => {
  it('accepts a normal address', () => {
    expect(validateNewEmail('new.member@example.com', 'old@example.com')).toBeNull()
  })

  it('requires a value', () => {
    expect(validateNewEmail('   ')).toBe('Email is required')
  })

  it('rejects an address without @', () => {
    expect(validateNewEmail('member.example.com')).toBe(
      'Please enter a valid email address'
    )
  })

  it('rejects the current address, ignoring case and spaces', () => {
    expect(validateNewEmail(' Old@Example.com ', 'old@example.com')).toBe(
      'New email must be different from your current email'
    )
  })

  it('accepts an address of exactly 254 characters', () => {
    const email = addressOfLength(MAX_EMAIL_LENGTH)
    expect(email).toHaveLength(MAX_EMAIL_LENGTH)
    expect(validateNewEmail(email)).toBeNull()
  })

  it('rejects a 270 character address', () => {
    const email = 'a'.repeat(258) + '@example.com'
    expect(email).toHaveLength(270)
    expect(validateNewEmail(email)).toBe(
      'Email address must be 254 characters or fewer'
    )
  })

  it('rejects a local part longer than 64 characters', () => {
    expect(validateNewEmail('a'.repeat(65) + '@example.com')).toBe(
      'The part before @ must be 64 characters or fewer'
    )
  })
})

describe('maskEmail', () => {
  it('keeps the first 3 and last 4 characters of the name', () => {
    expect(maskEmail('bisdev12345679@gmail.com')).toBe('bis*******5679@gmail.com')
  })

  it('leaves at least one character masked on short names', () => {
    expect(maskEmail('ab@x.com')).toBe('a*@x.com')
  })
})
