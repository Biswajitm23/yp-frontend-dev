// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  ONBOARDING_DRAFT_KEY,
  readOnboardingDraft,
  saveOnboardingAbout,
  saveOnboardingEducation,
  clearOnboardingDraft,
  lastSavedStep,
} from "./onboardingDraft";

const about = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.com",
  phone: "+441234567890",
  location: "London",
  dob: "2004-05-17",
  gender: "Female",
};

const education = {
  careerStatus: "At university",
  currentSituation: "",
  institution: "University of London",
  fieldOfStudy: "Computer Science",
  customFieldOfStudy: "",
  startYear: "2022",
  endYear: "2025",
  additionalSkills: ["React", "TypeScript"],
};

describe("onboardingDraft", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  // The draft must survive F5 but NOT outlive the browser — which is exactly
  // sessionStorage's lifetime. Writing to localStorage would leave a stale
  // onboarding sitting on disk after the tab is closed.
  it("stores the draft in sessionStorage, never localStorage", () => {
    saveOnboardingAbout(about);

    expect(window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("has nothing to restore in a fresh browser session", () => {
    saveOnboardingAbout(about);
    // Closing the browser drops sessionStorage; localStorage would survive.
    window.sessionStorage.clear();

    expect(readOnboardingDraft()).toBeNull();
  });

  it("purges a draft left in localStorage by the previous implementation", () => {
    window.localStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ version: 1, about }),
    );

    expect(readOnboardingDraft()).toBeNull();
    expect(window.localStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("has nothing to restore before anything is saved", () => {
    expect(readOnboardingDraft()).toBeNull();
    expect(lastSavedStep(null)).toBe(-1);
  });

  // Scenario 1: About saved, Education typed but never saved → a refresh must
  // bring back About only.
  it("restores only About when Education was never saved", () => {
    saveOnboardingAbout(about);

    const draft = readOnboardingDraft();
    expect(draft?.about).toEqual(about);
    expect(draft?.education).toBeUndefined();
    expect(lastSavedStep(draft)).toBe(0);
  });

  it("adds Education to the draft without dropping About", () => {
    saveOnboardingAbout(about);
    saveOnboardingEducation(education);

    const draft = readOnboardingDraft();
    expect(draft?.about).toEqual(about);
    expect(draft?.education).toEqual(education);
    expect(lastSavedStep(draft)).toBe(1);
  });

  it("keeps Education when About is re-saved from the Back button", () => {
    saveOnboardingAbout(about);
    saveOnboardingEducation(education);
    saveOnboardingAbout({ ...about, location: "Manchester" });

    const draft = readOnboardingDraft();
    expect(draft?.about?.location).toBe("Manchester");
    expect(draft?.education).toEqual(education);
  });

  it("clears the draft once onboarding is submitted", () => {
    saveOnboardingAbout(about);
    saveOnboardingEducation(education);
    clearOnboardingDraft();

    expect(readOnboardingDraft()).toBeNull();
    expect(window.sessionStorage.getItem(ONBOARDING_DRAFT_KEY)).toBeNull();
  });

  it("discards a corrupt or stale-version blob instead of throwing", () => {
    window.sessionStorage.setItem(ONBOARDING_DRAFT_KEY, "{not json");
    expect(readOnboardingDraft()).toBeNull();

    window.sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({ version: 0, about }),
    );
    expect(readOnboardingDraft()).toBeNull();
  });

  it("normalises unexpected field types rather than restoring them raw", () => {
    window.sessionStorage.setItem(
      ONBOARDING_DRAFT_KEY,
      JSON.stringify({
        version: 1,
        about: { firstName: 42, email: "ada@example.com" },
        education: { startYear: null, additionalSkills: "React" },
      }),
    );

    const draft = readOnboardingDraft();
    expect(draft?.about?.firstName).toBe("");
    expect(draft?.about?.email).toBe("ada@example.com");
    expect(draft?.about?.gender).toBe("");
    expect(draft?.education?.startYear).toBe("");
    expect(draft?.education?.additionalSkills).toEqual([]);
  });
});
