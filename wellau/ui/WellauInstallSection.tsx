import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowUpCircle, Check, Download, Loader2, RefreshCw } from "lucide-react";
import {
  INSTALL_TARGETS,
  useWellauInstall,
  type TargetState,
} from "@wellau/install/useWellauInstall";

export function WellauInstallSection() {
  const { t } = useTranslation();
  const { targets, detecting, busy, detect, installOne } = useWellauInstall();

  const nameOf = (target: TargetState): string => {
    const meta = INSTALL_TARGETS.find((m) => m.id === target.id)!;
    return t(`settings.install.targets.${meta.nameKey}`, {
      defaultValue: meta.id,
    });
  };

  const handleAction = async (target: TargetState) => {
    const name = nameOf(target);
    const isUpgrade = target.installed && target.upgradable;
    const err = await installOne(target.id);
    if (err) {
      toast.error(`${name}：${err}`);
      return;
    }
    toast.success(
      isUpgrade
        ? t("settings.install.toast.upgraded", {
            name,
            defaultValue: "{{name}} 已升级",
          })
        : t("settings.install.toast.installed", {
            name,
            defaultValue: "{{name}} 安装完成",
          }),
    );
  };

  return (
    <section className="space-y-3">
      <header className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-sm font-medium">
            {t("settings.install.title", { defaultValue: "环境安装" })}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t("settings.install.subtitle", {
              defaultValue: "点击每项右侧标签即可单独安装或升级 Claude / Codex",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void detect()}
          disabled={detecting || busy}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
          title={t("settings.install.redetect", { defaultValue: "重新检测" })}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${detecting ? "animate-spin" : ""}`} />
          {t("settings.install.redetect", { defaultValue: "重新检测" })}
        </button>
      </header>

      <div className="flex w-full max-w-md flex-col rounded-xl border border-border-default bg-card p-2 shadow-sm">
        <ul className="flex flex-col">
          {targets.map((target) => (
            <li
              key={target.id}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5"
            >
              <span className="min-w-0 flex-1 truncate text-sm">
                {nameOf(target)}
              </span>
              <ActionCell
                target={target}
                busy={busy}
                onAction={() => void handleAction(target)}
                t={t}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ActionCell({
  target,
  busy,
  onAction,
  t,
}: {
  target: TargetState;
  busy: boolean;
  onAction: () => void;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  if (target.status === "running") {
    return (
      <span className="flex shrink-0 items-center gap-1.5 px-2 text-xs text-blue-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {target.progress != null
          ? `${target.progress}%`
          : t("settings.install.running", { defaultValue: "处理中…" })}
      </span>
    );
  }

  // 已安装：远端最新版检测中 → 转圈占位（不抢先判定可升级）；检测完无新版 → 静态「已安装」。
  if (target.installed && !target.upgradable) {
    if (target.checkingLatest) {
      return (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t("settings.install.badge.installed", { defaultValue: "已安装" })}
        </span>
      );
    }
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5 text-green-500" />
        {t("settings.install.badge.installed", { defaultValue: "已安装" })}
      </span>
    );
  }

  // 可操作：可更新（蓝色，点击即升级）或安装（主色）。
  const isUpgrade = target.installed && target.upgradable;
  const label = isUpgrade
    ? t("settings.install.action.update", { defaultValue: "可更新" })
    : t("settings.install.action.install", { defaultValue: "安装" });
  const upgradeHint =
    isUpgrade && target.version && target.latest
      ? `${target.version} → ${target.latest}`
      : undefined;

  return (
    <button
      type="button"
      onClick={onAction}
      disabled={busy}
      title={
        target.status === "error" && target.error
          ? target.error
          : upgradeHint
      }
      className={[
        "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50",
        isUpgrade
          ? "bg-blue-500 text-white hover:bg-blue-600"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
      ].join(" ")}
    >
      {isUpgrade ? (
        <ArrowUpCircle className="h-3.5 w-3.5" />
      ) : (
        <Download className="h-3.5 w-3.5" />
      )}
      {label}
    </button>
  );
}
