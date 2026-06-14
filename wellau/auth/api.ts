import { invoke } from "@tauri-apps/api/core";
import type { WellauKey, WellauSession } from "@wellau/auth/types";

/** 后端返回的未登录错误标记，前端据此回到登录态。 */
export const UNAUTHENTICATED = "UNAUTHENTICATED";

export const wellauAuthApi = {
  async login(email: string, password: string): Promise<WellauSession> {
    return await invoke("wellau_login", { email, password });
  },

  async logout(): Promise<void> {
    await invoke("wellau_logout");
  },

  async getSession(): Promise<WellauSession | null> {
    return (await invoke("wellau_get_session")) ?? null;
  },

  async refresh(): Promise<WellauSession> {
    return await invoke("wellau_refresh");
  },

  async listKeys(): Promise<WellauKey[]> {
    return (await invoke("wellau_list_keys")) ?? [];
  },

  async removeImportedProviders(): Promise<number> {
    return (await invoke("wellau_remove_imported_providers")) ?? 0;
  },
};

export function isUnauthenticated(error: unknown): boolean {
  return typeof error === "string" && error.includes(UNAUTHENTICATED);
}
