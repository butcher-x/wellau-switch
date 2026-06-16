/**
 * Wellau 设置页可见性配置。
 *
 * 这是 Wellau 对 CC Switch 设置页"显隐"的唯一决定来源：复用核心的设置组件
 * 与保存逻辑，仅由本文件决定哪些 Tab / 分区显示。修改这里即可，不必改核心逻辑。
 *
 * `false` = 隐藏；缺省 / `true` = 显示。
 */

export type SettingsTabId =
  | "general"
  | "proxy"
  | "auth"
  | "advanced"
  | "usage"
  | "about";

export type GeneralSectionId =
  | "wellauAccount"
  | "wellauInstall"
  | "wellauUpdate"
  | "language"
  | "theme"
  | "appVisibility"
  | "skillStorage"
  | "skillSync"
  | "codexAuth"
  | "window"
  | "terminal";

export type AdvancedSectionId =
  | "directory"
  | "data"
  | "backup"
  | "cloudSync"
  | "test"
  | "logConfig";

interface WellauSettingsVisibility {
  tabs: Record<SettingsTabId, boolean>;
  generalSections: Record<GeneralSectionId, boolean>;
  advancedSections: Record<AdvancedSectionId, boolean>;
}

export const wellauSettingsVisibility: WellauSettingsVisibility = {
  tabs: {
    general: true,
    proxy: true,
    auth: false,
    advanced: false,
    usage: false,
    about: false,
  },
  generalSections: {
    wellauAccount: true,
    wellauInstall: true,
    wellauUpdate: true,
    language: true,
    theme: true,
    appVisibility: false,
    skillStorage: false,
    skillSync: false,
    codexAuth: false,
    window: true,
    terminal: true,
  },
  advancedSections: {
    directory: true,
    data: true,
    backup: true,
    cloudSync: true,
    test: true,
    logConfig: true,
  },
};

export function isSettingsTabVisible(id: SettingsTabId): boolean {
  return wellauSettingsVisibility.tabs[id] !== false;
}

export function isGeneralSectionVisible(id: GeneralSectionId): boolean {
  return wellauSettingsVisibility.generalSections[id] !== false;
}

export function isAdvancedSectionVisible(id: AdvancedSectionId): boolean {
  return wellauSettingsVisibility.advancedSections[id] !== false;
}

/** 按 Tab 在设置页中的固定顺序返回当前可见的 Tab 列表。 */
export const SETTINGS_TAB_ORDER: SettingsTabId[] = [
  "general",
  "proxy",
  "auth",
  "advanced",
  "usage",
  "about",
];

export function getVisibleSettingsTabs(): SettingsTabId[] {
  return SETTINGS_TAB_ORDER.filter(isSettingsTabVisible);
}

/**
 * 将请求的 Tab 解析为一个可见的 Tab：若目标被隐藏，回退到第一个可见 Tab，
 * 避免打开设置时停在空白页。
 */
export function resolveVisibleSettingsTab(requested: string): string {
  if (isSettingsTabVisible(requested as SettingsTabId)) {
    return requested;
  }
  return getVisibleSettingsTabs()[0] ?? "general";
}
