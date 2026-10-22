// src/lib/onboardingDraft.ts
//
// Persistence for the onboarding stepper (src/app/(pages)/onboarding/page.tsx).
//
// A step is written the moment the user SAVES it — "Save & Next" on About,
// "Save & Continue" on Education — so refreshing mid-onboarding never loses
// work that was already saved.
//
// SESSION storage, not local: the draft must survive a reload but die with the
// browser/tab, matching the `profile_completed=false` session cookie. Killing
// the browser leaves nothing behind, so the next visit starts onboarding clean.
//
// Only saved steps come back. Filling in Education and refreshing WITHOUT
// pressing "Save & Continue" restores About only; the half-typed Education
// fields are intentionally dropped, because nothing ever saved them.
//
// Step 3 (Profile Photo) is deliberately NOT persisted — a File / object URL
// can't be serialised, and re-picking the image is trivial.

export const ONBOARDING_DRAFT_KEY = "yp:onboarding:draft";

/** Bump when the stored shape changes incompatibly; older drafts are discarded. */
const DRAFT_VERSION = 1;

export type OnboardingAboutDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  location: string;
  dob: string;
  gender: string;
};

export type OnboardingEducationDraft = {
  careerStatus: string;
  currentSituation: string;
  institution: string;
  fieldOfStudy: string;
  customFieldOfStudy: string;
  startYear: string;
  endYear: string;
  additionalSkills: string[];
};

export type OnboardingDraft = {
  version: number;
  about?: OnboardingAboutDraft;
  education?: OnboardingEducationDraft;
};

const ABOUT_KEYS: (keyof OnboardingAboutDraft)[] = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "location",
  "dob",
  "gender",
];

const EDUCATION_STRING_KEYS: Exclude<
  keyof OnboardingEducationDraft,
  "additionalSkills"
>[] = [
  "careerStatus",
  "currentSituation",
  "institution",
  "fieldOfStudy",
  "customFieldOfStudy",
  "startYear",
  "endYear",
];

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coerce whatever is in storage into the exact About shape (never partial). */
function normalizeAbout(raw: unknown): OnboardingAboutDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const about = {} as OnboardingAboutDraft;
  ABOUT_KEYS.forEach((key) => {
    about[key] = str(source[key]);
  });
  return about;
}

/** Coerce whatever is in storage into the exact Education shape. */
function normalizeEducation(raw: unknown): OnboardingEducationDraft | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const source = raw as Record<string, unknown>;
  const education = { additionalSkills: [] } as unknown as OnboardingEducationDraft;
  EDUCATION_STRING_KEYS.forEach((key) => {
    education[key] = str(source[key]);
  });
  education.additionalSkills = Array.isArray(source.additionalSkills)
    ? source.additionalSkills.filter((s): s is string => typeof s === "string")
    : [];
  return education;
}

/**
 * Read the saved draft. Returns null when there is nothing usable — no draft,
 * a version bump, unparseable JSON, or a blob with neither section saved.
 */
export function readOnboardingDraft(): OnboardingDraft | null {
  if (typeof window === "undefined") return null;
  purgeLegacyLocalDraft();
  try {
    const raw = window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== DRAFT_VERSION) {
      window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      return null;
    }

    const about = normalizeAbout(parsed.about);
    const education = normalizeEducation(parsed.education);
    if (!about && !education) return null;

    return { version: DRAFT_VERSION, about, education };
  } catch {
    return null;
  }
}

/** Merge one section into the stored draft, leaving the other section intact. */
function writeSection(section: Partial<OnboardingDraft>): void {
  if (typeof window === "undefined") return;
  try {
    const current = readOnboardingDraft();
    const next: OnboardingDraft = {
      version: DRAFT_VERSION,
      about: current?.about,
      education: current?.education,
      ...section,
    };
    window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify(next));
  } catch {
    // Private mode / quota errors must never block the stepper.
  }
}

/** Persist the About step (called from "Save & Next"). */
export function saveOnboardingAbout(about: OnboardingAboutDraft): void {
  writeSection({ about });
}

/** Persist the Education step (called from "Save & Continue"). */
export function saveOnboardingEducation(education: OnboardingEducationDraft): void {
  writeSection({ education });
}

/**
 * Drop the draft. Call once the profile is actually created, on logout, and
 * whenever the draft is found to belong to a different account.
 */
export function clearOnboardingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // ignore
  }
  purgeLegacyLocalDraft();
}

/**
 * Cleanup of the draft's previous localStorage home. Anyone mid-onboarding when
 * this shipped would otherwise keep a copy that survives the browser being
 * closed — exactly what the session-storage switch is here to prevent. Called
 * on every read: it runs a handful of times per onboarding, and removeItem on a
 * missing key is a no-op.
 */
function purgeLegacyLocalDraft(): void {
  try {
    window.localStorage.removeItem(ONBOARDING_DRAFT_KEY);
  } catch {
    // ignore
  }
}

/**
 * Index of the last step the user actually saved: 0 = About, 1 = Education,
 * -1 = nothing. Derived from which sections are present rather than stored, so
 * a hand-edited / truncated blob can't strand the user on an empty step.
 */
export function lastSavedStep(draft: OnboardingDraft | null): number {
  if (!draft) return -1;
  if (draft.education) return 1;
  if (draft.about) return 0;
  return -1;
}