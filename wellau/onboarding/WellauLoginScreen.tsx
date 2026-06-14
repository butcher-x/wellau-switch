import { ShieldCheck, Sparkles, Zap } from "lucide-react";
import { wellauBrand } from "@wellau/brand";
import { WellauLoginForm } from "@wellau/auth/components/WellauLoginForm";

export function WellauLoginScreen() {
  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.18),transparent_30%),radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.14),transparent_28%),radial-gradient(circle_at_50%_85%,rgba(16,185,129,0.10),transparent_34%)]" />

      <main className="relative z-10 grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-center px-12 lg:flex xl:px-20">
          <div className="max-w-xl space-y-8">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border-default bg-card/70 px-3 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
                <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                Wellau-powered assistant switcher
              </div>
              <div className="space-y-3">
                <h1 className="text-4xl font-semibold tracking-tight xl:text-5xl">
                  {wellauBrand.productName}
                </h1>
                <p className="max-w-lg text-base leading-7 text-muted-foreground">
                  登录你的 Wellau 账号，自动导入 Claude 与 Codex Key，然后进入统一切换与路由管理界面。
                </p>
              </div>
            </div>

            <div className="grid max-w-lg grid-cols-2 gap-3">
              <FeatureCard
                icon={<Zap className="h-4 w-4" />}
                title="自动导入"
                description="登录后同步你的 Wellau Key"
              />
              <FeatureCard
                icon={<ShieldCheck className="h-4 w-4" />}
                title="本地保存"
                description="会话凭证仅保存在本机"
              />
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-2 text-center lg:text-left">
              <h2 className="text-2xl font-semibold">登录 Wellau</h2>
              <p className="text-sm text-muted-foreground">
                登录成功后会自动导入你的 Claude / Codex Key。
              </p>
            </div>
            <WellauLoginForm
              variant="hero"
              className="flex w-full flex-col gap-3 rounded-2xl border border-border-default bg-card/80 p-6 shadow-xl shadow-black/10 backdrop-blur"
            />
          </div>
        </section>
      </main>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-border-default bg-card/60 p-4 shadow-sm backdrop-blur">
      <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
