import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Download, Loader2, RefreshCw } from "lucide-react";
import { getVersion } from "@tauri-apps/api/app";
import { useUpdate } from "@/contexts/UpdateContext";
import { settingsApi } from "@/lib/api/settings";
import { extractErrorMessage } from "@/utils/errorUtils";

/**
 * 「设置 → 通用 → 软件更新」
 *
 * Wellau 构建隐藏了「关于」Tab，这里把更新检测/一键更新搬到通用分区。
 * 复用核心的 UpdateContext（启动自动检查 + 手动检查）与后端
 * install_update_and_restart（下载 → 验签 → 安装 → 重启）。
 */
export function WellauUpdateSection() {
  const { t } = useTranslation();
  const { hasUpdate, updateInfo, isChecking, checkUpdate } = useUpdate();
  const [version, setVersion] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    let alive = true;
    getVersion()
      .then((v) => alive && setVersion(v))
      .catch(() => alive && setVersion(""));
    return () => {
      alive = false;
    };
  }, []);

  const busy = isChecking || isUpdating;

  const handleClick = async () => {
    if (hasUpdate) {
      setIsUpdating(true);
      try {
        const installed = await settingsApi.installUpdateAndRestart();
        if (!installed) {
          toast.success(
            t("settings.upToDate", { defaultValue: "已是最新版本" }),
          );
        }
        // 成功会触发应用重启，无需额外处理。
      } catch (e) {
        toast.error(t("settings.updateFailed", { defaultValue: "更新失败" }), {
          description: extractErrorMessage(e) || undefined,
        });
      } finally {
        setIsUpdating(false);
      }
      return;
    }
    try {
      const available = await checkUpdate();
      if (!available) {
        toast.success(t("settings.upToDate", { defaultValue: "已是最新版本" }));
      }
    } catch {
      toast.error(
        t("settings.checkUpdateFailed", { defaultValue: "检查更新失败" }),
      );
    }
  };

  const buttonLabel = isUpdating
    ? t("settings.update.installing", { defaultValue: "更新中…" })
    : hasUpdate
      ? t("settings.update.install", { defaultValue: "立即更新" })
      : isChecking
        ? t("settings.update.checking", { defaultValue: "检查中…" })
        : t("settings.update.check", { defaultValue: "检查更新" });

  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h3 className="text-sm font-medium">
          {t("settings.update.title", { defaultValue: "软件更新" })}
        </h3>
        <p className="text-xs text-muted-foreground">
          {version
            ? t("settings.update.current", {
                version,
                defaultValue: "当前版本 v{{version}}",
              })
            : t("settings.update.subtitle", {
                defaultValue: "检查并安装最新版本",
              })}
        </p>
      </header>

      <div className="flex w-full max-w-md items-center justify-between gap-3 rounded-xl border border-border-default bg-card p-4 shadow-sm">
        <div className="min-w-0 text-sm">
          {hasUpdate && updateInfo ? (
            <span className="font-medium text-emerald-600 dark:text-emerald-400">
              {t("settings.update.available", {
                version: updateInfo.availableVersion,
                defaultValue: "发现新版本 v{{version}}",
              })}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {t("settings.update.upToDateHint", {
                defaultValue: "已是最新版本",
              })}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleClick()}
          disabled={busy}
          className={[
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
            hasUpdate
              ? "bg-emerald-500 text-white hover:bg-emerald-600"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          ].join(" ")}
        >
          {isUpdating || isChecking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : hasUpdate ? (
            <Download className="h-3.5 w-3.5" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {buttonLabel}
        </button>
      </div>
    </section>
  );
}
