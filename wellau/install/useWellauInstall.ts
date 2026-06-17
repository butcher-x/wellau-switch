import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { settingsApi } from "@/lib/api/settings";
import { installApi, type DesktopAppId } from "@/lib/api/install";
import { isUpdateAvailable } from "@/lib/version";

export type TargetId =
  | "claude-cli"
  | "claude-desktop"
  | "codex-cli"
  | "codex-desktop";

export type TargetKind = "cli" | "desktop";
export type StepStatus = "idle" | "running" | "done" | "error";

interface TargetMeta {
  id: TargetId;
  kind: TargetKind;
  /** CLI 工具名（对应 run_tool_lifecycle_action / probe_tool_installations）。 */
  tool?: "claude" | "codex";
  /** 桌面应用 id（对应 install_desktop_app / probe_desktop_apps）。 */
  app?: DesktopAppId;
  /** i18n 名称键: settings.install.targets.<nameKey> */
  nameKey: string;
}

export const INSTALL_TARGETS: TargetMeta[] = [
  { id: "claude-cli", kind: "cli", tool: "claude", nameKey: "claudeCli" },
  { id: "claude-desktop", kind: "desktop", app: "claude", nameKey: "claudeDesktop" },
  { id: "codex-cli", kind: "cli", tool: "codex", nameKey: "codexCli" },
  { id: "codex-desktop", kind: "desktop", app: "codex", nameKey: "codexDesktop" },
];

const META_BY_ID = new Map(INSTALL_TARGETS.map((m) => [m.id, m]));

export interface TargetState {
  id: TargetId;
  installed: boolean;
  version: string | null;
  latest: string | null;
  upgradable: boolean;
  /** 正在联网检测远端最新版（仅 CLI）：UI 据此在该项显示转圈。 */
  checkingLatest: boolean;
  status: StepStatus;
  progress: number | null;
  error: string | null;
}

interface InstallProgressPayload {
  target: string;
  phase: string;
  percent: number | null;
  message: string;
}

function initialTargets(): TargetState[] {
  return INSTALL_TARGETS.map((m) => ({
    id: m.id,
    installed: false,
    version: null,
    latest: null,
    upgradable: false,
    checkingLatest: false,
    status: "idle",
    progress: null,
    error: null,
  }));
}

function errMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) {
    return String((e as { message: unknown }).message);
  }
  return String(e);
}

/**
 * 「设置 → 通用 → 环境安装」逐项安装/升级编排。
 *
 * 每项独立操作（点击行内标签即触发）：CLI 走 run_tool_lifecycle_action（缺 npm
 * 先 install_node，幂等），桌面应用走 install_desktop_app。登录与 Key 导入由上方
 * 「Wellau 账户」区负责，这里只管工具的安装与升级。
 */
export function useWellauInstall() {
  const [targets, setTargets] = useState<TargetState[]>(initialTargets);
  const [detecting, setDetecting] = useState(false);

  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const patchTarget = useCallback((id: TargetId, patch: Partial<TargetState>) => {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }, []);

  /** 探测各项已安装状态（本地扫描，不联网）。 */
  const detect = useCallback(async () => {
    setDetecting(true);
    // CLI 项先进入「检测远端中」：本地探测出已安装会立即显示，远端最新版查到前
    // 该项持续转圈（避免「先已安装、3 秒后突然变可升级」的跳变）。
    setTargets((prev) =>
      prev.map((t) =>
        META_BY_ID.get(t.id)!.kind === "cli" ? { ...t, checkingLatest: true } : t,
      ),
    );

    // CLI：probe_tool_installations 纯本地扫描，避免联网查 npm 最新版卡住。
    try {
      const reports = await settingsApi.probeToolInstallations([
        "claude",
        "codex",
      ]);
      setTargets((prev) =>
        prev.map((t) => {
          const meta = META_BY_ID.get(t.id)!;
          if (meta.kind !== "cli") return t;
          const r = reports.find((x) => x.tool === meta.tool);
          const inst =
            r?.installs?.find((i) => i.runnable) ?? r?.installs?.[0] ?? null;
          return {
            ...t,
            installed: Boolean(inst),
            version: inst?.version ?? null,
            status: "idle",
          };
        }),
      );
    } catch (e) {
      console.error("[WellauInstall] 探测 CLI 安装失败", e);
    }

    // 桌面应用（本地探测，不联网）。
    try {
      const apps = await installApi.probeDesktopApps(["claude", "codex"]);
      setTargets((prev) =>
        prev.map((t) => {
          const meta = META_BY_ID.get(t.id)!;
          if (meta.kind !== "desktop") return t;
          const s = apps.find((a) => a.app === meta.app);
          return { ...t, installed: Boolean(s?.installed), status: "idle" };
        }),
      );
    } catch (e) {
      console.error("[WellauInstall] 探测桌面应用失败", e);
    }

    setDetecting(false);

    // 最新版本（联网 best-effort）：仅用于「可升级」徽章。
    try {
      const versions = await settingsApi.getToolVersions(["claude", "codex"]);
      setTargets((prev) =>
        prev.map((t) => {
          const meta = META_BY_ID.get(t.id)!;
          if (meta.kind !== "cli") return t;
          const v = versions.find((x) => x.name === meta.tool);
          const latest = v?.latest_version ?? null;
          return {
            ...t,
            latest,
            upgradable: isUpdateAvailable(t.version, latest),
            checkingLatest: false,
          };
        }),
      );
    } catch (e) {
      console.error("[WellauInstall] 获取最新版本失败", e);
      // 检测失败也要停转圈，回落到静态「已安装」。
      setTargets((prev) =>
        prev.map((t) =>
          META_BY_ID.get(t.id)!.kind === "cli" ? { ...t, checkingLatest: false } : t,
        ),
      );
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  // 桌面/Node 下载安装进度事件 → 对应行的 progress。
  useEffect(() => {
    const unlisten = listen<InstallProgressPayload>(
      "install-progress",
      (ev) => {
        const { target, percent } = ev.payload;
        if (META_BY_ID.has(target as TargetId)) {
          patchTarget(target as TargetId, { progress: percent });
        }
      },
    );
    return () => {
      void unlisten.then((f) => f());
    };
  }, [patchTarget]);

  /** 单项安装/升级。成功返回 null，失败返回错误信息（供 UI toast）。 */
  const installOne = useCallback(
    async (id: TargetId): Promise<string | null> => {
      const meta = META_BY_ID.get(id);
      const target = targetsRef.current.find((t) => t.id === id);
      if (!meta || !target) return null;
      // 已安装且无可升级则无需操作。
      if (target.installed && !target.upgradable) return null;

      patchTarget(id, { status: "running", error: null, progress: null });
      try {
        if (meta.kind === "cli") {
          const tool = meta.tool!;
          // 缺 npm 先自举 Node（install_node 幂等：已有 npm 直接跳过）。
          if (!target.installed) {
            try {
              await installApi.installNode();
            } catch (e) {
              console.error("[WellauInstall] Node 自举失败（继续尝试 CLI）", e);
            }
          }
          const action = target.installed ? "update" : "install";
          await settingsApi.runToolLifecycleAction([tool], action);
          const reports = await settingsApi.probeToolInstallations([tool]);
          const r = reports.find((x) => x.tool === tool);
          const inst =
            r?.installs?.find((i) => i.runnable) ?? r?.installs?.[0] ?? null;
          patchTarget(id, {
            status: "done",
            installed: Boolean(inst),
            version: inst?.version ?? null,
            upgradable: inst
              ? isUpdateAvailable(inst.version, target.latest)
              : target.upgradable,
            progress: null,
          });
        } else {
          const app = meta.app!;
          await installApi.installDesktopApp(app);
          patchTarget(id, { status: "done", installed: true, progress: null });
        }
        return null;
      } catch (e) {
        const msg = errMessage(e);
        patchTarget(id, { status: "error", error: msg, progress: null });
        return msg;
      }
    },
    [patchTarget],
  );

  const busy = targets.some((t) => t.status === "running");

  return {
    targets,
    detecting,
    busy,
    detect,
    installOne,
  };
}
