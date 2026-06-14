import { useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  LogOut,
  RefreshCw,
  UserRound,
  Wallet,
} from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { useWellauAuth } from "@wellau/auth/WellauAuthProvider";
import { WellauLoginForm } from "@wellau/auth/components/WellauLoginForm";

function formatExpiry(expiresAt: number): string {
  if (!expiresAt) return "-";
  try {
    return new Date(expiresAt * 1000).toLocaleString();
  } catch {
    return "-";
  }
}

function AccountInfo() {
  const { state, logout, importKeys, importing } = useWellauAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  if (state.status !== "authenticated") return null;
  const { session } = state;

  const handleImport = async () => {
    try {
      const summary = await importKeys();
      toast.success(
        `已导入 ${summary.imported} 个 Key（Claude ${summary.claude} / Codex ${summary.codex}）`,
      );
    } catch (err) {
      toast.error(`导入失败：${typeof err === "string" ? err : String(err)}`);
    }
  };

  const handleLogout = async () => {
    const confirmed = await ask(
      "登出后由 Wellau 导入的供应商会被一并删除，确定登出吗？",
      { title: "登出 Wellau", kind: "warning" },
    );
    if (!confirmed) return;
    setLoggingOut(true);
    try {
      await logout();
      toast.success("已登出，并已清除导入的供应商");
    } catch (err) {
      toast.error(`登出失败：${typeof err === "string" ? err : String(err)}`);
    } finally {
      setLoggingOut(false);
    }
  };

  const busy = importing || loggingOut;

  return (
    <div className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-border-default bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-500">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{session.email}</p>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Wallet className="h-3 w-3" />
            余额 ¥{session.balance.toFixed(2)}
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        登录有效期至 {formatExpiry(session.expires_at)}
      </p>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleLogout}
          disabled={busy}
          className="flex-1"
        >
          {loggingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          登出
        </Button>
        <Button
          size="sm"
          onClick={handleImport}
          disabled={busy}
          className="flex-1"
        >
          {importing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          重新导入 Key
        </Button>
      </div>
    </div>
  );
}

export function WellauAccountSection() {
  const { state } = useWellauAuth();

  return (
    <section className="space-y-3">
      <header className="space-y-1">
        <h3 className="text-sm font-medium">Wellau 账户</h3>
        <p className="text-xs text-muted-foreground">
          {state.status === "authenticated"
            ? "管理你的 Wellau 账号与 Key"
            : "登录后可自动导入你的 Wellau Key"}
        </p>
      </header>
      {state.status === "loading" && (
        <p className="text-xs text-muted-foreground">加载中…</p>
      )}
      {state.status === "anonymous" && <WellauLoginForm />}
      {state.status === "authenticated" && <AccountInfo />}
    </section>
  );
}
