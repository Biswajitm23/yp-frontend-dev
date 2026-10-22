// Single source of truth for the year floors used by the profile date inputs.
//
// Onboarding (src/app/(pages)/onboarding/page.tsx) and the profile editor
// (EducationCard / ProfileInfoCard) build the same controls, and they MUST agree:
//   - if onboarding offered an earlier education year than the profile editor, a
//     value saved during onboarding would be missing from the dropdown when the
//     user later edits that entry;
//   - the education Start Year is validated against the birth year ("Start year
//     cannot be before your birth year"), so the DOB floor is the EFFECTIVE floor
//     for education years. Keeping them equal is what makes the full education
//     range actually selectable.

/** Earliest selectable education start year. */
export const EDUCATION_MIN_YEAR = 1900;

/** Earliest selectable date of birth (Jan 1 of this year). */
export const DOB_MIN_YEAR = 1900;

/** Convenience: DOB floor as a Date, for calendar `minDate` / `startMonth`. */
export const DOB_MIN_DATE = new Date(DOB_MIN_YEAR, 0, 1);
