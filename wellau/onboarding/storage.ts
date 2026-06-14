export const INTRO_STORAGE_KEY = "wellau-switch-intro-seen";

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(INTRO_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_STORAGE_KEY, "true");
  } catch {
    // Onboarding state is non-critical; ignore unavailable localStorage.
  }
}
