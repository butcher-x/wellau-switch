export const wellauBrand = {
  productName: "Wellau Router",
  shortName: "Wellau",
  description: "Wellau-powered assistant switcher built on the CC Switch core.",
  websiteUrl: "https://wellau.com",
  supportUrl: "https://wellau.com",
  themeStorageKey: "wellau-switch-theme",
  lastAppStorageKey: "wellau-switch-last-app",
  lastViewStorageKey: "wellau-switch-last-view",
  configDisplayPath: "~/.wellau-switch/config.json",
  deepLinkScheme: "wellauswitch",
  bundleIdentifier: "com.wellau.switch",
  defaultVisibleApps: {
    claude: true,
    "claude-desktop": false,
    codex: true,
    gemini: false,
    opencode: false,
    openclaw: false,
    hermes: false,
  },
} as const;

export type WellauBrand = typeof wellauBrand;
