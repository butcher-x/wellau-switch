import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  AlertCircle,
  Check,
  CircleDashed,
  Download,
  Loader2,
  Minus,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { WellauLoginForm } from "@wellau/auth/components/WellauLoginForm";
import {
  INSTALL_TARGETS,
  useWellauInstall,
  type AuxStep,
  type StepStatus,
  type TargetState,
} from "@wellau/install/useWellauInstall";

function StatusIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case "running":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    case "done":
      return <Check className="h-4 w-4 text-green-500" />;
    case "error":
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    case "skipped":
      return <Minus className="h-4 w-4 text-muted-foreground" />;
    default:
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
  }
}

export function WellauInstallSection() {
  const { t } = useTranslation();
  const {
    targets,
    nodeStep,
    importStep,
    running,
    detecting,
    needsLogin,
    summary,
    toggle,
    detect,
    runOneClick,
  } = useWellauInstall();

  const summaryShown = useRef<ImportSummaryRef>(null);
  useEffect(() => {
    if (summary && summary !== summaryShown.current) {
      summaryShown.current = summary;
      toast.success(
        t("settings.install.importDone", {
          count: summary.imported,
          claude: summary.claude,
          codex: summary.codex,
          defaultValue:
            "已导入 {{count}} 个 Key（Claude {{claude}} / Codex {{codex}}）",
        }),
      );
    }
  }, [summary, t]);

  const tip = (target: TargetState): string => {
    if (target.upgradable && target.version && target.latest) {
      return t("settings.install.badge.upgradable", {
        from: target.version,
        to: target.latest,
        defaultValue: "可升级 {{from}} → {{to}}",
      });
    }
    if (target.installed) {
      return target.version
        ? t("settings.install.badge.installedVersion", {
            version: target.version,
            defaultValue: "已安装 {{version}}",
          })
        : t("settings.install.badge.installed", { defaultValue: "已安装" });
    }
    return t("settings.install.badge.pending", { defaultValue: "待安装" });
  };

  const selectedCount = targets.filter((x) => x.selected).length;

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {t("settings.install.title", { defaultValue: "环境安装" })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.install.subtitle", {
              defaultValue:
                "一键安装 Claude / Codex 命令行与桌面应用，并自动导入 Key",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void detect()}
          disabled={detecting || running}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title={t("settings.install.redetect", { defaultValue: "重新检测" })}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} />
          {t("settings.install.redetect", { defaultValue: "重新检测" })}
        </button>
      </header>

      <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-default bg-card p-5 shadow-sm">
        <ul className="flex flex-col gap-2.5">
          {targets.map((target) => {
            const meta = INSTALL_TARGETS.find((m) => m.id === target.id)!;
            return (
              <li key={target.id} className="flex items-center gap-3">
                <Checkbox
                  id={`install-${target.id}`}
                  checked={target.selected}
                  disabled={running}
                  onCheckedChange={(v) => toggle(target.id, v === true)}
                />
                <label
                  htmlFor={`install-${target.id}`}
                  className="min-w-0 flex-1 cursor-pointer truncate text-sm"
                >
                  {t(`settings.install.targets.${meta.nameKey}`, {
                    defaultValue: meta.id,
                  })}
                </label>
                <Badge
                  variant={target.upgradable ? "default" : "secondary"}
                  className="shrink-0 font-normal"
                >
                  {tip(target)}
                </Badge>
                {target.status !== "idle" && (
                  <span className="flex w-8 shrink-0 items-center justify-end gap-1">
                    {target.progress != null && target.status === "running" && (
                      <span className="text-[10px] text-muted-foreground">
                        {target.progress}%
                      </span>
                    )}
                    <StatusIcon status={target.status} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <Button
          onClick={() => void runOneClick()}
          disabled={running || selectedCount === 0}
          className="w-full"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("settings.install.running", { defaultValue: "安装中…" })}
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              {t("settings.install.run", { defaultValue: "一键安装" })}
            </>
          )}
        </Button>

        {(nodeStep.status !== "idle" || importStep.status !== "idle") && (
          <div className="flex flex-col gap-2 border-t border-border-default pt-3">
            {nodeStep.status !== "idle" && (
              <AuxRow
                label={t("settings.install.steps.node", {
                  defaultValue: "安装 Node.js",
                })}
                step={nodeStep}
              />
            )}
            {importStep.status !== "idle" && (
              <AuxRow
                label={t("settings.install.steps.import", {
                  defaultValue: "导入 Key",
                })}
                step={importStep}
              />
            )}
          </div>
        )}

        {needsLogin && (
          <div className="border-t border-border-default pt-3">
            <p className="mb-2 text-xs text-muted-foreground">
              {t("settings.install.loginHint", {
                defaultValue: "安装完成，请登录 Wellau 以导入 Key",
              })}
            </p>
            <WellauLoginForm />
          </div>
        )}
      </div>
    </section>
  );
}

function AuxRow({ label, step }: { label: string; step: AuxStep }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <StatusIcon status={step.status} />
      <span className="flex-1 truncate text-muted-foreground">{label}</span>
      {step.progress != null && step.status === "running" && (
        <span className="text-[10px] text-muted-foreground">
          {step.progress}%
        </span>
      )}
      {step.error && (
        <span className="max-w-[60%] truncate text-red-500" title={step.error}>
          {step.error}
        </span>
      )}
    </div>
  );
}

type ImportSummaryRef = ReturnType<typeof useWellauInstall>["summary"];
