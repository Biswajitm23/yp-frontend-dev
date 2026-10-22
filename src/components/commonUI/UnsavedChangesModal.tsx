'use client'

import { CircleAlert } from 'lucide-react'
import ConfirmModal from './ConfirmModal'

interface UnsavedChangesModalProps {
  isOpen: boolean
  /** Throw the draft away and continue with the close the user asked for. */
  onDiscard: () => void
  /** Dismiss the prompt and leave the editor open with the draft intact. */
  onKeepEditing: () => void
}

/**
 * "Unsaved changes" prompt shown when a user closes an edit form (X, Cancel,
 * Escape or backdrop) while the draft differs from what was loaded.
 *
 * Single source of truth for the copy so every edit surface — Profile Info,
 * About, Education, Top Skills, Profile Summary — asks the same question with
 * the same wording. Keeping the draft is the primary (right-hand) action;
 * discarding is the destructive secondary one on the left.
 */
export default function UnsavedChangesModal ({
  isOpen,
  onDiscard,
  onKeepEditing
}: UnsavedChangesModalProps) {
  return (
    <ConfirmModal
      isOpen={isOpen}
      icon={<CircleAlert />}
      iconVariant='warning'
      // X / Escape / backdrop are low-commitment exits — never lose the draft
      // on those; only the explicit "Discard" button throws work away.
      onClose={onKeepEditing}
      onConfirm={onKeepEditing}
      onCancel={onDiscard}
      title='Unsaved changes'
      message='Your edits will be lost if you close without saving. Do you want to discard them?'
      confirmText='Keep Editing'
      cancelText='Discard'
      cancelVariant='danger'
    />
  )
}
