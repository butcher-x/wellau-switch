import { invoke } from "@tauri-apps/api/core";

/** 桌面应用 id（与后端 install_desktop_app / probe_desktop_apps 对齐）。 */
export type DesktopAppId = "claude" | "codex";

/** 单个桌面应用的探测结果（对应后端 DesktopAppStatus）。 */
export interface DesktopAppStatus {
  app: DesktopAppId;
  installed: boolean;
  /** 已安装时定位到的路径（macOS app 目录 / Windows exe 或包名）。 */
  path: string | null;
}

/**
 * 环境安装相关命令封装。
 *
 * - CLI 安装/更新沿用 `settingsApi.runToolLifecycleAction` / `getToolVersions`，不在此重复。
 * - 这里只封装 wellau-installer 迁移过来的"桌面应用安装"与"Node 自举"。
 * - 进度通过 `install-progress` 事件回报（见 useWellauInstall）。
 */
export const installApi = {
  /** 探测桌面应用安装状态（macOS 同时查 ~/Applications 与 /Applications）。 */
  async probeDesktopApps(apps: DesktopAppId[]): Promise<DesktopAppStatus[]> {
    return await invoke("probe_desktop_apps", { apps });
  },

  /** 下载并安装桌面应用。macOS 默认装到 ~/Applications，全程免授权。 */
  async installDesktopApp(app: DesktopAppId): Promise<void> {
    await invoke("install_desktop_app", { app });
  },

  /** 自举安装官方 Node.js（仅在缺少 npm 且需要安装 CLI 时调用）。 */
  async installNode(): Promise<void> {
    await invoke("install_node");
  },
};
