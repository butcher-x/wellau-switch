import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUpdate } from "@/contexts/UpdateContext";
import { settingsApi } from "@/lib/api/settings";
import { extractErrorMessage } from "@/utils/errorUtils";

/**
 * 自动更新弹窗。
 *
 * 应用启动后 UpdateProvider 会在后台自动检测更新（延迟 1s）。一旦检测到新版，
 * 本组件自动弹窗提示用户：可「立即更新」(下载→验签→安装→重启) 或「稍后」。
 * 「稍后」仅关闭当前会话的弹窗，不持久化——下次打开应用若仍有更新会再次提示。
 */
export function WellauUpdatePrompt() {
  const { hasUpdate, updateInfo } = useUpdate();
  const { t } = useTranslation();
  const [closed, setClosed] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const open = hasUpdate && !!updateInfo && !closed;

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      await settingsApi.installUpdateAndRestart();
      // 成功会触发应用重启，无需额外处理。
    } catch (e) {
      toast.error(t("settings.updateFailed", { defaultValue: "更新失败" }), {
        description: extractErrorMessage(e) || undefined,
      });
      setIsUpdating(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isUpdating) setClosed(true);
      }}
    >
      <DialogContent
        zIndex="alert"
        className="max-w-md"
        onEscapeKeyDown={(e) => {
          if (isUpdating) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-emerald-500" />
            {t("settings.update.promptTitle", { defaultValue: "发现新版本" })}
          </DialogTitle>
          <DialogDescription>
            {t("settings.update.promptDesc", {
              version: updateInfo?.availableVersion ?? "",
              current: updateInfo?.currentVersion ?? "",
              defaultValue:
                "新版本 v{{version}} 可用（当前 v{{current}}）。是否立即更新？",
            })}
          </DialogDescription>
        </DialogHeader>

        {updateInfo?.notes ? (
          <div className="max-h-48 overflow-auto whitespace-pre-wrap px-6 py-4 text-sm text-muted-foreground">
            {updateInfo.notes}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            variant="outline"
            disabled={isUpdating}
            onClick={() => setClosed(true)}
          >
            {t("settings.update.later", { defaultValue: "稍后" })}
          </Button>
          <Button disabled={isUpdating} onClick={() => void handleUpdate()}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("settings.update.installing", { defaultValue: "更新中…" })}
              </>
            ) : (
              t("settings.update.install", { defaultValue: "立即更新" })
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
