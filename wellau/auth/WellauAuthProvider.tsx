import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { wellauAuthApi } from "@wellau/auth/api";
import { importWellauKeys } from "@wellau/auth/importKeys";
import type { AuthState, ImportSummary } from "@wellau/auth/types";

interface WellauAuthContextValue {
  state: AuthState;
  importing: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  importKeys: () => Promise<ImportSummary>;
}

const WellauAuthContext = createContext<WellauAuthContextValue | null>(null);

export function WellauAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: "loading" });
  const [importing, setImporting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const invalidateProviders = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["providers"] });
    // 导入会自动开启路由接管，刷新代理/接管状态让工具栏开关即时更新。
    await queryClient.invalidateQueries({ queryKey: ["proxyStatus"] });
    await queryClient.invalidateQueries({ queryKey: ["proxyTakeoverStatus"] });
  }, [queryClient]);

  const runImport = useCallback(async (): Promise<ImportSummary> => {
    setImporting(true);
    try {
      const summary = await importWellauKeys();
      await invalidateProviders();
      return summary;
    } finally {
      if (mounted.current) setImporting(false);
    }
  }, [invalidateProviders]);

  // 启动时恢复登录态。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await wellauAuthApi.getSession();
        if (cancelled) return;
        setState(
          session && session.logged_in
            ? { status: "authenticated", session }
            : { status: "anonymous" },
        );
      } catch {
        if (!cancelled) setState({ status: "anonymous" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const session = await wellauAuthApi.login(email, password);
      if (mounted.current) {
        setState({ status: "authenticated", session });
      }
      // 登录成功后自动导入 Key（失败不影响登录态，仅记录日志）。
      try {
        await runImport();
      } catch (e) {
        console.error("[WellauAuth] 自动导入 Key 失败", e);
      }
    },
    [runImport],
  );

  const logout = useCallback(async () => {
    await wellauAuthApi.logout();
    // 登出时清除所有由 Wellau 导入的供应商，避免残留凭证。
    try {
      await wellauAuthApi.removeImportedProviders();
      await invalidateProviders();
    } catch (e) {
      console.error("[WellauAuth] 清理 Wellau 供应商失败", e);
    }
    if (mounted.current) setState({ status: "anonymous" });
  }, [invalidateProviders]);

  const value = useMemo<WellauAuthContextValue>(
    () => ({ state, importing, login, logout, importKeys: runImport }),
    [state, importing, login, logout, runImport],
  );

  return (
    <WellauAuthContext.Provider value={value}>
      {children}
    </WellauAuthContext.Provider>
  );
}

export function useWellauAuth(): WellauAuthContextValue {
  const ctx = useContext(WellauAuthContext);
  if (!ctx) {
    throw new Error("useWellauAuth must be used within a WellauAuthProvider");
  }
  return ctx;
}
