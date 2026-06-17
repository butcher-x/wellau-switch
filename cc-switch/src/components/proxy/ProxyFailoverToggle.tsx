/**
 * 代理接管 + 故障转移 合并开关
 *
 * 把原来的「接管」(ProxyToggle) 与「故障转移」(FailoverToggle) 两个开关合并为一个：
 * - 打开：先接管，再启用故障转移（故障转移依赖接管先生效）。
 * - 关闭：先停用故障转移，再撤销接管。
 * 两个底层状态始终同步开/同步关。
 */

import { Radio, Shuffle, Loader2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useProxyStatus } from "@/hooks/useProxyStatus";
import {
  useAutoFailoverEnabled,
  useSetAutoFailoverEnabled,
} from "@/lib/query/failover";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import type { AppId } from "@/lib/api";

interface ProxyFailoverToggleProps {
  className?: string;
  activeApp: AppId;
}

export function ProxyFailoverToggle({
  className,
  activeApp,
}: ProxyFailoverToggleProps) {
  const { t } = useTranslation();
  const { isRunning, takeoverStatus, setTakeoverForApp, isPending, status } =
    useProxyStatus();
  const { data: failoverEnabled = false, isLoading: failoverLoading } =
    useAutoFailoverEnabled(activeApp);
  const setFailover = useSetAutoFailoverEnabled();

  const takeoverEnabled = takeoverStatus?.[activeApp] || false;
  // 合并后的统一状态：两者都开才算「开」。
  const enabled = takeoverEnabled && failoverEnabled;
  const busy = isPending || setFailover.isPending || failoverLoading;

  const handleToggle = async (checked: boolean) => {
    try {
      if (checked) {
        // 先接管，再开故障转移（故障转移要求已接管）。
        await setTakeoverForApp({ appType: activeApp, enabled: true });
        await setFailover.mutateAsync({ appType: activeApp, enabled: true });
      } else {
        // 先关故障转移，再撤接管。
        await setFailover.mutateAsync({ appType: activeApp, enabled: false });
        await setTakeoverForApp({ appType: activeApp, enabled: false });
      }
    } catch (error) {
      console.error("[ProxyFailoverToggle] Toggle failed:", error);
    }
  };

  const appLabel =
    activeApp === "claude"
      ? "Claude"
      : activeApp === "codex"
        ? "Codex"
        : activeApp === "gemini"
          ? "Gemini"
          : "OpenCode";

  const tooltipText = enabled
    ? isRunning
      ? t("proxy.combined.tooltip.active", {
          appLabel,
          address: status?.address,
          port: status?.port,
          defaultValue: `${appLabel} 已接管并启用故障转移 - ${status?.address}:${status?.port}`,
        })
      : t("proxy.combined.tooltip.broken", {
          appLabel,
          defaultValue: `${appLabel} 已接管，但代理服务未运行`,
        })
    : t("proxy.combined.tooltip.inactive", {
        appLabel,
        defaultValue: `一键接管 ${appLabel} 并启用故障转移`,
      });

  return (
    <div
      className={cn(
        "flex items-center gap-1 px-1.5 h-8 rounded-lg bg-muted/50 transition-all",
        className,
      )}
      title={tooltipText}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <span className="flex items-center gap-0.5">
          <Radio
            className={cn(
              "h-4 w-4 transition-colors",
              enabled ? "text-emerald-500 animate-pulse" : "text-muted-foreground",
            )}
          />
          <Shuffle
            className={cn(
              "h-4 w-4 transition-colors",
              enabled ? "text-emerald-500 animate-pulse" : "text-muted-foreground",
            )}
          />
        </span>
      )}
      <Switch
        checked={enabled}
        onCheckedChange={handleToggle}
        disabled={busy}
      />
    </div>
  );
}
