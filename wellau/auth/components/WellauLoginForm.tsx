import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Lock, LogIn, Mail } from "lucide-react";
import { settingsApi } from "@/lib/api/settings";
import { Button } from "@/components/ui/button";
import { useWellauAuth } from "@wellau/auth/WellauAuthProvider";

const REGISTER_URL = "https://wellau.com/register";

interface WellauLoginFormProps {
  className?: string;
  variant?: "compact" | "hero";
}

export function WellauLoginForm({
  className,
  variant = "compact",
}: WellauLoginFormProps) {
  const { login } = useWellauAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("邮箱和密码不能为空");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await login(email.trim(), password);
      toast.success("登录成功");
    } catch (err) {
      setError(typeof err === "string" ? err : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const isHero = variant === "hero";

  return (
    <form
      onSubmit={onSubmit}
      className={
        className ??
        "flex w-full max-w-md flex-col gap-3 rounded-xl border border-border-default bg-card p-5 shadow-sm"
      }
    >
      <div className="relative">
        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="email"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Wellau 邮箱"
          disabled={submitting}
          className="h-10 w-full rounded-lg border border-border-default bg-background pl-9 pr-3 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
      </div>

      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码"
          disabled={submitting}
          className="h-10 w-full rounded-lg border border-border-default bg-background pl-9 pr-10 text-sm outline-none transition-colors focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
          aria-label={showPassword ? "隐藏密码" : "显示密码"}
        >
          {showPassword ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </button>
      </div>

      {error && (
        <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting}
        className={isHero ? "h-11 w-full text-sm" : "h-10 w-full"}
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            登录中…
          </>
        ) : (
          <>
            <LogIn className="h-4 w-4" />
            登录
          </>
        )}
      </Button>

      <button
        type="button"
        onClick={() => settingsApi.openExternal(REGISTER_URL)}
        className="self-center text-xs text-muted-foreground transition-colors hover:text-blue-500"
      >
        没有账号？<span className="text-blue-500">前往注册</span>
      </button>
    </form>
  );
}
