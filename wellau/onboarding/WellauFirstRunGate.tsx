import { useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { useWellauAuth } from "@wellau/auth/WellauAuthProvider";
import { IntroVideoScreen } from "@wellau/onboarding/IntroVideoScreen";
import { WellauLoginScreen } from "@wellau/onboarding/WellauLoginScreen";
import { hasSeenIntro, markIntroSeen } from "@wellau/onboarding/storage";

export function WellauFirstRunGate({ children }: { children: ReactNode }) {
  const { state } = useWellauAuth();
  const [introSeen, setIntroSeen] = useState(() => hasSeenIntro());
  const shouldShowIntro = useMemo(() => !introSeen, [introSeen]);

  const completeIntro = () => {
    markIntroSeen();
    setIntroSeen(true);
  };

  if (shouldShowIntro) {
    return <IntroVideoScreen onComplete={completeIntro} />;
  }

  if (state.status === "loading") {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (state.status !== "authenticated") {
    return <WellauLoginScreen />;
  }

  return <>{children}</>;
}
