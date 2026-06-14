import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { settingsApi } from "@/lib/api/settings";
import { installApi, type DesktopAppId } from "@/lib/api/install";
import { isUpdateAvailable } from "@/lib/version";
import { useWellauAuth } from "@wellau/auth/WellauAuthProvider";
import type { ImportSummary } from "@wellau/auth/types";

export type TargetId =
  | "claude-cli"
  | "claude-desktop"
  | "codex-cli"
  | "codex-desktop";

export type TargetKind = "cli" | "desktop";
export type StepStatus = "idle" | "running" | "done" | "error" | "skipped";

interface TargetMeta {
  id: TargetId;
  kind: TargetKind;
  /** CLI 工具名（对应 run_tool_lifecycle_action / get_tool_versions）。 */
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
  selected: boolean;
  installed: boolean;
  version: string | null;
  latest: string | null;
  upgradable: boolean;
  status: StepStatus;
  progress: number | null;
  error: string | null;
}

export interface AuxStep {
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

const IDLE_AUX: AuxStep = { status: "idle", progress: null, error: null };

function initialTargets(): TargetState[] {
  return INSTALL_TARGETS.map((m) => ({
    id: m.id,
    selected: false,
    installed: false,
    version: null,
    latest: null,
    upgradable: false,
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
 * 「设置 → 通用 → 环境安装」一键安装编排。
 *
 * 复用已迁移的后端能力：CLI 走 run_tool_lifecycle_action / get_tool_versions，
 * 桌面应用走 install_desktop_app，登录/导入走 useWellauAuth + importWellauKeys。
 * 仅新增 Node 自举（install_node，幂等：已有 npm 则后端直接跳过）。
 */
export function useWellauInstall() {
  const { state: authState, importKeys } = useWellauAuth();

  const [targets, setTargets] = useState<TargetState[]>(initialTargets);
  const [nodeStep, setNodeStep] = useState<AuxStep>(IDLE_AUX);
  const [importStep, setImportStep] = useState<AuxStep>(IDLE_AUX);
  const [running, setRunning] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);

  const targetsRef = useRef(targets);
  targetsRef.current = targets;

  const patchTarget = useCallback((id: TargetId, patch: Partial<TargetState>) => {
    setTargets((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    );
  }, []);

  const toggle = useCallback(
    (id: TargetId, selected: boolean) => {
      if (running) return;
      patchTarget(id, { selected });
    },
    [running, patchTarget],
  );

  /** 探测各项已安装状态：未安装项默认勾选。 */
  const detect = useCallback(async () => {
    try {
      const versions = await settingsApi.getToolVersions(["claude", "codex"]);
      setTargets((prev) =>
        prev.map((t) => {
          const meta = META_BY_ID.get(t.id)!;
          if (meta.kind !== "cli") return t;
          const v = versions.find((x) => x.name === meta.tool);
          const installed = Boolean(v?.version);
          const latest = v?.latest_version ?? null;
          return {
            ...t,
            installed,
            version: v?.version ?? null,
            latest,
            upgradable: isUpdateAvailable(v?.version, latest),
            selected: installed ? t.selected : true,
          };
        }),
      );
    } catch (e) {
      console.error("[WellauInstall] 探测 CLI 版本失败", e);
    }

    try {
      const apps = await installApi.probeDesktopApps(["claude", "codex"]);
      setTargets((prev) =>
        prev.map((t) => {
          const meta = META_BY_ID.get(t.id)!;
          if (meta.kind !== "desktop") return t;
          const s = apps.find((a) => a.app === meta.app);
          const installed = Boolean(s?.installed);
          return {
            ...t,
            installed,
            selected: installed ? t.selected : true,
          };
        }),
      );
    } catch (e) {
      console.error("[WellauInstall] 探测桌面应用失败", e);
    }
  }, []);

  useEffect(() => {
    void detect();
  }, [detect]);

  // 后端下载/安装进度事件 → 对应步骤的 progress。
  useEffect(() => {
    const unlisten = listen<InstallProgressPayload>(
      "install-progress",
      (ev) => {
        const { target, percent } = ev.payload;
        if (target === "node") {
          setNodeStep((s) => ({ ...s, progress: percent }));
          return;
        }
        if (META_BY_ID.has(target as TargetId)) {
          patchTarget(target as TargetId, { progress: percent });
        }
      },
    );
    return () => {
      void unlisten.then((f) => f());
    };
  }, [patchTarget]);

  // 触发登录后由 WellauAuthProvider.login 自动导入；这里同步反映导入步骤完成。
  useEffect(() => {
    if (needsLogin && authState.status === "authenticated") {
      setNeedsLogin(false);
      setImportStep({ status: "done", progress: null, error: null });
    }
  }, [needsLogin, authState.status]);

  const runOneClick = useCallback(async () => {
    setRunning(true);
    setSummary(null);
    setNeedsLogin(false);
    setNodeStep(IDLE_AUX);
    setImportStep(IDLE_AUX);

    const selected = targetsRef.current.filter((t) => t.selected);
    const clis = selected.filter((t) => META_BY_ID.get(t.id)!.kind === "cli");
    const desktops = selected.filter(
      (t) => META_BY_ID.get(t.id)!.kind === "desktop",
    );

    // 重置被选项状态。
    for (const t of selected) {
      patchTarget(t.id, { status: "idle", progress: null, error: null });
    }

    // 1. Node 自举（仅在需要装 CLI 时）。install_node 幂等：已有 npm 则后端直接跳过。
    if (clis.some((t) => !t.installed)) {
      setNodeStep({ status: "running", progress: null, error: null });
      try {
        await installApi.installNode();
        setNodeStep({ status: "done", progress: null, error: null });
      } catch (e) {
        // npm 可能本就存在；不阻断后续 CLI 安装，失败仅记录。
        setNodeStep({ status: "error", progress: null, error: errMessage(e) });
      }
    }

    // 2. CLI：未装→install；已装且可升级→update；已装且最新→skip。
    for (const t of clis) {
      const meta = META_BY_ID.get(t.id)!;
      const tool = meta.tool!;
      if (t.installed && !t.upgradable) {
        patchTarget(t.id, { status: "skipped" });
        continue;
      }
      const action = t.installed ? "update" : "install";
      patchTarget(t.id, { status: "running", error: null });
      try {
        await settingsApi.runToolLifecycleAction([tool], action);
        const refreshed = await settingsApi.getToolVersions([tool]);
        const v = refreshed.find((x) => x.name === tool);
        patchTarget(t.id, {
          status: "done",
          installed: Boolean(v?.version),
          version: v?.version ?? null,
          latest: v?.latest_version ?? null,
          upgradable: isUpdateAvailable(v?.version, v?.latest_version),
          progress: null,
        });
      } catch (e) {
        patchTarget(t.id, { status: "error", error: errMessage(e) });
      }
    }

    // 3. 桌面应用：已装→skip；否则下载安装（macOS 落 ~/Applications）。
    for (const t of desktops) {
      const meta = META_BY_ID.get(t.id)!;
      const app = meta.app!;
      if (t.installed) {
        patchTarget(t.id, { status: "skipped" });
        continue;
      }
      patchTarget(t.id, { status: "running", error: null });
      try {
        await installApi.installDesktopApp(app);
        patchTarget(t.id, { status: "done", installed: true, progress: null });
      } catch (e) {
        patchTarget(t.id, { status: "error", error: errMessage(e) });
      }
    }

    // 4. 登录 + 导入 Key。
    if (authState.status === "authenticated") {
      setImportStep({ status: "running", progress: null, error: null });
      try {
        const s = await importKeys();
        setSummary(s);
        setImportStep({ status: "done", progress: null, error: null });
      } catch (e) {
        setImportStep({ status: "error", progress: null, error: errMessage(e) });
      }
    } else {
      // 未登录：交给内联登录表单，登录成功后 Provider 自动导入。
      setNeedsLogin(true);
    }

    setRunning(false);
  }, [authState.status, importKeys, patchTarget]);

  return {
    targets,
    nodeStep,
    importStep,
    running,
    needsLogin,
    summary,
    authStatus: authState.status,
    toggle,
    detect,
    runOneClick,
  };
}
