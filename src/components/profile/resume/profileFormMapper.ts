// ───────────────────────────────────────────────────────────────────────────
// Resume upload — profile-update payload mapping
//
// The backend's update-profile endpoint is a full replace, so every mutation
// must ride along with the user's existing fields. buildProfilePreservePayload
// is the canonical "preserve everything else" helper used across the app; we
// reuse it here and then attach the resume.
//
//  - Upload/replace → multipart FormData with the `resume` File appended.
//  - Remove         → plain JSON with `is_resume_delete: true` (no file).
// ───────────────────────────────────────────────────────────────────────────

import { buildProfilePreservePayload } from "@/services/profile.services";

/** Loose shape of the profile object — we only read the resume fields. */
export interface ProfileLike {
  resume_url?: string | null;
  resume?: string | null;
  [key: string]: unknown;
}

/**
 * Build a multipart FormData for a profile update that includes the resume.
 * Existing profile fields are appended as strings; `resume` is the File.
 */
export function buildResumeUploadFormData(
  user: ProfileLike,
  resume: File,
): FormData {
  const base = buildProfilePreservePayload(user);
  const formData = new FormData();

  for (const [key, value] of Object.entries(base)) {
    if (value === undefined || value === null) continue;
    formData.append(key, String(value));
  }

  formData.append("resume", resume);
  return formData;
}

/**
 * Build the payload for removing the resume. There is no file to upload, so this
 * is a plain JSON profile update — the exact shape every other non-file edit
 * sends (buildProfilePreservePayload + overrides).
 *
 * `/api/mobile/update-profile` clears the stored CV when the `is_resume_delete`
 * flag is true; `resume_url: ""` is sent alongside so the URL field is cleared
 * too. Earlier attempts that sent only an empty/whitespace `resume_url` (with no
 * flag) did nothing — the endpoint removes the CV on the explicit flag.
 */
export function buildResumeRemovePayload(
  user: ProfileLike,
): Record<string, unknown> {
  return buildProfilePreservePayload(user, {
    is_resume_delete: true,
    resume_url: "",
  });
}
